import { IoEffect } from "./io";
import { Target, TumalExecOptions } from "./types";
import { UserInterfaceControl } from "./ui";
import { createMakefile } from "./create-makefile";
import { runTargets } from "./run-targets";
import { yarnWorkspaces } from "./configure-yarn-workspaces";
import { createRedoFiles } from "./create-redo-files";

export class Tumal {

    sources: Promise<string[]> = Promise.resolve([]);
    targets = new Map<string, Target>();
    tumalDir = this.io.mkdir('.tumal');

    constructor(private io: IoEffect) {
    }

    async exec(command: string[], opts: TumalExecOptions): Promise<void> {
        await this.tumalDir;

        const root = await yarnWorkspaces(this.io, './package.json', { ...opts, sourcesFrom: 'git' });
        await root.forEachPkg(async pkg => {
            pkg.exec(command);
        });

        this.workOnTargets(root.targets, opts);
    }

    async yarnRun(script: string, args: string[], opts: TumalExecOptions): Promise<void> {
        await this.tumalDir;

        const root = await yarnWorkspaces(this.io, './package.json', { ...opts, sourcesFrom: 'git' });
        await root.forEachPkg(async pkg => {
            pkg.yarnRun(script);
        });

        this.workOnTargets(root.targets, opts);
    }

    async was(opts: TumalExecOptions): Promise<void> {
        await this.tumalDir;

        const root = await yarnWorkspaces(this.io, './package.json', { ...opts, sourcesFrom: 'git' });
        await root.forEachPkg(async pkg => {
            const deps = pkg.json.all_dependency_names().map(this.io.mangle);
            const build = pkg.yarnRun('build').dependsOn(root.yarnRun(deps, 'build'));
            const test = pkg.yarnRun('test').dependsOn(build);
            const format = pkg.yarnRun('format');
            const lint = pkg.yarnRun('lint').dependsOn(format);

            Object.keys(pkg.json.scripts())
                .filter(script => ['build', 'test', 'format', 'lint'].indexOf(script) === -1)
                .forEach(script => {
                    const target = pkg.yarnRun(script);

                    if (script.startsWith('start')) {
                        target.dependsOn(build);
                    }
                });

            // NOTE for build targets consider tsconfig file to get sources
            /*
            const tsconfigPath = (pkg.json.scripts.build || "").find(/tsc (-p|--project) (\S+)/).$2
            const tsconfig = pkg.loadJson(tsconfigPath);
            build.srcs = await tumal.globJson(tsconfig.files);
            */

            // NOTE for test targets consider mocha.opts file to get sources
            /*
            const mochaOptsPath = pkg.findFile('mocha.opts');
            const mochaOpts = pkg.loadFile(mochaOptsPath);
            test.srcs = tumal.parseArgsForPaths(mochaOpts);
            */
        });

        this.workOnTargets(root.targets, opts);
    }

    async workOnTargets(targets: Target[], opts: TumalExecOptions) {
        if (opts.todo === 'makefile') {
            return await createMakefile(this.io, targets, 'Makefile');
        }
        if (opts.todo === 'redo') {
            return await createRedoFiles(this.io, targets);
        }
        if (true || opts.todo === 'run') {
            return await runTargets(targets, this.io, opts);
        }
    }
}
