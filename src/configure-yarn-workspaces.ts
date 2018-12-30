import { TumalExecOptions, Target, TumalCommand, AnyObject } from "./types";
import { isObject } from "util";
import { PackageJson } from "./package-json";
import * as path from "path";
import chalk from "chalk";
import { IoEffect } from "./io";
import { makePromise } from "./fat-promise";
import { SpawnOptions } from "child_process";

export async function yarnWorkspaces(io: IoEffect, packageJsonPath: string, opts: { sourcesFrom: 'none' | 'git' } & TumalExecOptions) {
    const configure = new ConfigureYarnWorkspaces(io);
    return await configure.yarnWorkspaces(packageJsonPath, opts);
}

class ConfigureYarnWorkspaces {

    sources = Promise.resolve(new Array<string>());
    packageJsons = new PackageJsons(this.io);

    constructor(private io: IoEffect) {
    }

    async yarnWorkspaces(packageJsonPath: string, opts: { sourcesFrom: 'none' | 'git' } & TumalExecOptions) {

        this.sources = {
            none: this.sourcesFromCwd(), // Promise.resolve([]),
            git: this.sourcesFromCwd(),
        }[opts.sourcesFrom];

        const srcs = await this.sources;

        const io = this.io;
        const tumal = this;
        const packageJsons = await this.packageJsons.fromYarnWorkspaces(packageJsonPath);
        const targets = [];

        function yarnRunCmd(target: Target, script: string, json: PackageJson): TumalCommand {
            if (!!json.scripts()[script]) {
                const command = ['yarn', 'run', script];
                const func = async (target: Target) => tumal.spawnWithLogging(target, command, { cwd: target.cwd });
                const cmdScript = `cd '${path.normalize(target.cwd)}' && ${command.map(c => `'${c}'`).join(' ')}`
                return { func, script: cmdScript };
            } else {
                const func = async () => { return { finish: Promise.resolve(0) } };
                return { func, script: '' };
            }
        }

        function yarnRun(script: string) {
            const target = tumal.makeTargetFromPackageJson(this.json, opts);

            target.name = io.mangle(`${script}-${target.name}`);
            target.cmd = yarnRunCmd(target, script, this.json);

            targets.push(target);
            return target;
        }

        function exec(command: string[]) {
            const target = tumal.makeTargetFromPackageJson(this.json, opts);

            target.name = io.mangle(`exec-${command[0]}-${target.name}`);
            const func = async (target: Target) => tumal.spawnWithLogging(target, command, { cwd: target.cwd });
            const cmdScript = `cd '${target.cwd}' && ${command.map(c => `'${c}'`).join(' ')}`
            target.cmd = { func, script: cmdScript };

            targets.push(target);
            return target;
        }

        function toPkg(json: PackageJson) {
            return { json, yarnRun, exec };
        }

        function forEachPkg<T>(func: (pkg: ReturnType<typeof toPkg>) => T) {
            return Promise.all(packageJsons.map(async (promisedJson) => {
                const json = await promisedJson;
                if (json) {
                    await func(toPkg(json));
                }
            }));
        }

        function yarnRunNames(names: string[], script: string) {
            return names.map(name => io.mangle(`${script}-${name}`));
        }

        return { forEachPkg, targets, yarnRun: yarnRunNames };
    }

    //

    private makeTargetFromPackageJson<Opts extends TumalExecOptions>(packageJson: PackageJson, opts: Opts): Target {
        const { useSrcs, byDeps, force, cmd } = opts;
        const name = packageJson.name();
        const cwd = packageJson.dirname();
        const filterSrcs = (srcs: string[]) => srcs.filter(src => src.startsWith(cwd));
        const srcs = useSrcs ? this.sources.then(filterSrcs) : Promise.resolve([]);
        const target = new Target({ name, cmd, cwd, srcs });
        return target;
    }

    //

    private async spawnWithLogging(target: Target, command: string[], options: SpawnOptions) {
        const logFilepath = `${target.stampFilepath}.log`;
        const logStream = this.io.createWriteStream(logFilepath);

        const opened = makePromise();
        logStream.once('open', opened.resolve);
        await opened.promise;

        const env = { ...process.env };
        if (chalk.supportsColor.level > 0) {
            env.FORCE_COLOR = `${chalk.supportsColor.level}`;
        }

        return this.io.spawn(command[0], command.slice(1), {
            ...options,
            env,
            stdio: ['ignore', logStream, logStream],
            shell: true,
        });
    }

    //

    private async sourcesFromCwd(): Promise<string[]> {
        const { stdout } = await this.io.exec('git ls-files', { maxBuffer: 2 ** 32 });
        return stdout.split('\n').map(path.normalize).map(s => s.replace('\\', '/'));
    }
}

class PackageJsons {

    constructor(private io: IoEffect) {
    }

    async fromYarnWorkspaces(filepath: string) {
        const json = await this.loadPackageJsonFile(filepath);
        const workspaces = json && json.workspaces();
        const globs = workspaces.map(line => line + '/package.json');
        const filepaths = await this.pathsFromGlobs(globs);
        return filepaths.map(pkgJsonPath => this.loadPackageJsonFile(pkgJsonPath));
    }

    private async loadPackageJsonFile(filepath: string): Promise<PackageJson | null> {
        try {
            const content = await this.io.readFile(filepath);
            const json = JSON.parse(content) as unknown;
            console.assert(isObject(json), `tumal: JSON object in ${filepath}`);
            return new PackageJson(json as AnyObject, filepath);
        } catch {
            return null;
        }
    }

    private async pathsFromGlobs(globs: string[]): Promise<string[]> {
        // TODO use async glob and catch exceptions
        return globs.reduce((paths, glob) => paths.concat(this.io.globSync(glob)), [] as string[]);
    }
}