import { isString, isObject } from "util";
import { join, dirname, normalize } from "path";
import * as toposort from 'toposort';
import { IoEffect } from "./io";
import * as logUpdate from "log-update";
import * as cliSpinners from "cli-spinners";
import chalk, { Chalk } from "chalk";

let ioEffect: IoEffect;

export interface RaiseExecOptions {
    toTarget: string,
}

export interface SourceProvider {
    sourcesFromCwd(): Promise<string[]>;
}

export class GitSources implements SourceProvider {
    constructor(private ioEffect: IoEffect) { }

    async sourcesFromCwd(): Promise<string[]> {
        const { stdout } = await this.ioEffect.exec('git ls-files', { maxBuffer: 2 ** 32 });
        return stdout.split('\n').map(normalize);
    }
}

interface RaiseAnalysis {
    targets: Map<string, Target>
    order: Target[]
    sources: string[]
}

export class Raise {

    constructor(
        private ioEffect: IoEffect,
        private sourceProvider: SourceProvider,
    ) { }

    private async relevantTargets(toTarget?: string) {
        const targets = await make_targets_from_root_package_json('package.json');
        const targetsMap = new Map(targets.map((t) => t.entry()));
        fill_consumers(targetsMap);

        let relevant_deps: typeof targets;
        if (toTarget) {
            const target = targetsMap.get(toTarget);
            relevant_deps = dependency_way_to(target, targetsMap);
        } else {
            relevant_deps = targets;
        }
        const targets_working_map = new Map(relevant_deps.map((t) => t.entry()));
        return targets_working_map;
    }

    async status() {
        ioEffect = this.ioEffect;

        const targetsMap = await this.relevantTargets();
        const todo = execution_order(targetsMap);

        
    }

    private async analyze(opts: Partial<RaiseExecOptions> = {}): Promise<RaiseAnalysis> {
        const sources = await this.sourceProvider.sourcesFromCwd();
        const targets = await this.relevantTargets();
        const order = execution_order(targets);
        return { targets, order, sources };
    }

    async exec(command: string, opts: Partial<RaiseExecOptions> = {}): Promise<void> {
        ioEffect = this.ioEffect;
        const analysis = await this.analyze(opts);

        const promises: Map<PackageName, Promise<void>> = new Map();
        const spinners = createSpinners();

        let time = 0;
        const frame = () => {
            time += 80;

            let lines = analysis.order.map(t => {
                const spinner = spinners.get(t.state);
                const frameNum = Math.floor((time - t.start) / spinner.interval) % spinner.frames.length;
                const frame = spinner.frames[frameNum];
                return frame + ' ' + t.name;
            });
            const maxWidth = Math.max(...lines.map(l => l.length));
            lines = lines.map(l => l + ' '.repeat(maxWidth - l.length))
            lines = lines.map((l, i) => l + ' ' + analysis.order[i].last_line)
            logUpdate('\n', ...lines.map(l => l + '\n'));
        }
        const timer = setInterval(frame, 80);

        analysis.order.forEach((target) => {
            promises.set(target.name, task(target, command));
        })

        async function task(target: Target, build_cmd: string): Promise<void> {
            const deps_promises = target.deps.map((name) => promises.get(name))

            await Promise.all(deps_promises);
            if (await target.out_of_date(analysis)) {
                //tasks.inc(target);
                target.state = TargetState.WORKING;
                target.start = time;
                try {
                    await target.build(build_cmd);
                    target.state = TargetState.SUCCESS;
                } catch {
                    target.state = TargetState.FAILING;
                }
                //tasks.dec(target);
            } else {
                target.state = TargetState.NOTTODO;
            }
        }

        await Promise.all(Array.from(promises.values()))

        clearInterval(timer);

        frame();
    }
}

enum TargetState { UNKNOWN, WORKING, NOTTODO, SUCCESS, FAILING }

class Target {

    public state = TargetState.UNKNOWN;
    public start = 0;
    public last_line = '';
    consumers: string[] = [];

    constructor(
        public name: string,
        public deps: string[],
        public dir: string,
    ) { }

    static async from_package_json(path: string): Promise<Target> {
        const json = await load_package_json(path);
        const name = get_name(json);
        const deps = get_all_dependencies(json);
        const dir = dirname(path);

        if (name) {
            return new Target(name, deps, dir);
        } else {
            throw new Error(`No name found in ${path}.`)
        }
    }

    entry(): [string, Target] {
        return [this.name, this];
    }

    async mtime(): Promise<number> {
        return mtime_from_file(this.stamp_file());
    }

    stamp_file(): string {
        return join(this.dir, '.raise');
    }

    private async srcsMtimes(files: string[]): Promise<number[]> {
        const srcs = files_in_dir(this.dir, files);
        return await Promise.all(srcs.map(mtime_from_file));
    }

    private async depsMTimes(targets_map: Map<string, Target>): Promise<number[]> {
        return await Promise.all(filterMapFor(targets_map, this.deps).map(t => t.mtime()));
    }

    async out_of_date(analysis: RaiseAnalysis): Promise<boolean> {
        try {
            const stamps = await Promise.all([
                this.mtime(),
                this.srcsMtimes(analysis.sources),
                this.depsMTimes(analysis.targets),
            ])
            const newestMs = Math.max(...stamps[1], ...stamps[2]);
            return newestMs > stamps[0];
        } catch (e) {
            console.error(e);
            return true;
        }
    }

    async build(build_cmd: string): Promise<void> {
        const cwd = this.dir;
        try {
            const { stdout, stderr, finish } = await ioEffect.execStream(build_cmd, { cwd });
            stdout.on('data', line => this.last_line = line)
            stderr.on('data', line => this.last_line = chalk.yellow(line))
            const retcode = await finish;
            if (retcode !== 0) {
                throw new Error();
            }
            await ioEffect.writeFile(this.stamp_file(), '');
        } catch (e) {
            console.error('ERROR', this.name);
            throw e;
        }
    }
}

async function make_targets_from_root_package_json(path: string): Promise<Target[]> {
    const json = await load_package_json(path);
    const workspaces = get_workspaces(json);
    const dirs = await dirsFromGlobs(workspaces);
    const promised_targets = dirs
        .map((dir) => join(dir, 'package.json'))
        .map((path) => tryOrNull(() => Target.from_package_json(path)));
    const targets = await Promise.all(promised_targets);
    return targets.filter(isObject);
}

async function mtime_from_file(path: string): Promise<number> {
    try {
        const { mtimeMs } = await ioEffect.stat(path);
        return mtimeMs;
    } catch {
        return 0;
    }
}

function fill_consumers(targetsMap: Map<string, Target>): void {
    targetsMap.forEach((target, name) => {
        target.deps.forEach((depName) => {
            const depTarget = targetsMap.get(depName);
            if (depTarget) {
                depTarget.consumers.push(name);
            }
        })
    })
}

class ConcurrentTasksLogger {
    private tasks = 0;

    inc(target: Target): void {
        ++this.tasks;
        console.log(' '.repeat(this.tasks) + this.tasks, 'START', target.name);
    }

    dec(target: Target): void {
        --this.tasks;
        console.log(' '.repeat(this.tasks) + this.tasks, 'END', target.name);
    }
}

function filterMapFor<K, V>(map: Map<K, V>, list: K[]): V[] {
    return list.map((key) => map.get(key)).filter((val) => val !== undefined);
}

function dependency_way_to(target: Target, targetsMap: Map<string, Target>): Target[] {
    const deps = [target];
    const todo = filterMapFor(targetsMap, target.deps);
    while (todo.length > 0) {
        const dep = todo.pop();
        deps.push(dep);
        const new_todos = filterMapFor(targetsMap, dep.deps)
            .filter((t) => !deps.includes(t) && !deps.includes(t));
        todo.push(...new_todos);
    }
    return deps;
}

function files_in_dir(dir: string, files: string[]): string[] {
    return files.filter((path) => path.startsWith(dir));
}

function execution_order(targetsMap: Map<string, Target>): Target[] {
    return filterMapFor(targetsMap, toposort(dependency_edges(targetsMap)));
}

function dependency_edges(targetsMap: Map<string, Target>): Edge[] {
    const edges: Edge[] = [];
    targetsMap.forEach((target, name) => {
        target.consumers.forEach((consumer) => {
            edges.push([name, consumer]);
        });
    });
    return edges;
}

type PackageName = string;
type Edge = [PackageName, PackageName];

async function load_package_json(path: string): Promise<PackageJson> {
    try {
        const content = await ioEffect.readFile(path);
        return JSON.parse(content);
    } catch {
        return {};
    }
}

async function dirsFromGlobs(globs: string[]): Promise<string[]> {
    return globs.reduce((dirs, glob) => dirs.concat(ioEffect.globSync(glob)), new Array<string>());
}



interface PackageJson { }

function get_name(json: PackageJson): PackageName | undefined {
    const { name } = json as any;
    return name;
}

function get_all_dependencies(json: PackageJson): PackageName[] {
    const { dependencies, devDependencies } = json as any;
    const deps = [];
    if (isObject(dependencies)) {
        deps.push(...Object.keys(dependencies));
    }
    if (isObject(devDependencies)) {
        deps.push(...Object.keys(devDependencies));
    }
    return deps;
}

function get_workspaces(json: PackageJson): string[] {
    const { workspaces } = json as any;
    if (isStringArray(workspaces)) {
        return workspaces;
    } else {
        return [];
    }
}



function isStringArray(array: unknown): array is string[] {
    return Array.isArray(array) && array.every(isString);
}

async function tryOrNull<Ret>(func: () => Promise<Ret>): Promise<Ret | null> {
    return func().catch<null>(async () => null);
}



function createSpinners() {
    const frameOneWidth = (spinner) => spinner.frames[0].length
    const singleFrame = (frame): Spinner => ({ interval: 1, frames: [ frame ] })
    const mapFrames = (s, func): Spinner => ({ interval: s.interval, frames: s.frames.map(func) })
    const baseSpinner = cliSpinners.circleHalves;
    const makeFrame = (color: Chalk, str: string) => {
        const width = frameOneWidth(baseSpinner);
        const times = Math.max(str.length, Math.floor(width / str.length));
        return singleFrame(color(str.repeat(times)));
    }

    type Spinner = { interval: number, frames: string[] };

    const spinnersList: [TargetState, Spinner][] = [
        [ TargetState.UNKNOWN, makeFrame(chalk.gray, '◎') ],
        [ TargetState.WORKING, mapFrames(baseSpinner, f => chalk.cyan(f)) ],
        [ TargetState.SUCCESS, makeFrame(chalk.greenBright, '◉') ],
        [ TargetState.NOTTODO, makeFrame(chalk.green, '◉') ],
        [ TargetState.FAILING, makeFrame(chalk.red, '◉') ],
    ]
    return new Map<TargetState, Spinner>(spinnersList);
}