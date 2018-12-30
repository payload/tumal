import { ExecStreamReturn } from "./io";
import { FatPromise } from "./fat-promise";
import { ChildProcess } from "child_process";
import { isString } from "util";

interface _TumalExecOptions {
    targets: string[],
    force: boolean,
    byDeps: boolean,
    useSrcs: boolean,
    mangleName: (name: string) => string,
    cmd: TumalCommand,
    todo: 'makefile' | 'run' | 'redo',
    onlyShowTargets: boolean,
    ui: 'auto' | 'fancy' | 'simple',
}

export interface TumalExecOptions extends Partial<_TumalExecOptions> { };

export interface TumalCommand {
    func: (target: Target) => Promise<TumalCommandResult>;
    script: string,
}

export interface TumalCommandResult {
    finish: Promise<string | number>;
    child?: ChildProcess,
}

export class Target {
    name: string
    deps: string[] = []
    srcs?: Promise<string[]>
    doingTime?: number
    doneTime?: Promise<number>
    cmd?: TumalCommand
    cmdRun?: TumalCommandResult
    doing?: FatPromise<void>
    stdout?: string
    stderr?: string
    cwd?: string
    state?: TargetState
    stampFilepath?: string

    constructor(fields: Partial<{ [ K in keyof Target ]: Target[ K ] }>) {
        for (const key in fields) {
            this[ key ] = fields[ key ];
        }
        console.assert(this.name, 'Target.name');
    }

    dependsOn(targets: Target | string | (Target | string)[]) {
        targets = Array.isArray(targets) ? targets : [ targets ];
        const names = targets.map(t => isString(t) ? t : t.name);
        this.deps.push(...names);
        return this;
    }
}

export enum TargetState {
    Waiting = 'waiting on dependencies',
    CheckOutOfDate = 'check if out of date',
    NotOutOfDate = 'not out of date',
    CantDo = 'can not do',
    Working = 'working',
    Success = 'success',
    Failure = 'failure',
}

export interface TransformTarget<T> {
    (target: Target): Promise<T>
}

export type AnyObject = Object & { [ K in keyof any ]: any };

export interface UserInterface {
    update(): Promise<void> | void;
    stop(): Promise<void> | void;
}