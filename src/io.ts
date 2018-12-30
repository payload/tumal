import { promisify } from "util";
import * as glob from "glob";
import * as fs from "fs";
import * as child_process from "child_process";
import { makePromise } from "./fat-promise";
import { AnyObject } from "./types";

export interface IoEffect {
    stat(path: fs.PathLike, opts?: StatOpts): Promise<fs.Stats>;
    readFile(path: fs.PathLike): Promise<string>;
    writeFile(path: fs.PathLike, content: string): Promise<void>;
    exec(command: string, options?: child_process.ExecOptions): Promise<ExecReturn>;
    execStream(command: string, options?: child_process.ExecOptions): ExecStreamReturn;
    globSync(pattern: string, options?: glob.IOptions): string[]
    mangle(str: string): string
    createWriteStream: typeof fs.createWriteStream;
    spawn: RealIoEffect[ 'spawn' ];
    mkdir: RealIoEffect[ 'mkdir' ]
}

const stat = promisify(fs.stat)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);

const exec = promisify(child_process.exec)

type ExecReturn = { stdout: string, stderr: string };
export type ExecStreamReturn = ReturnType<RealIoEffect[ 'execStream' ]>;
export type SpawnReturn = ReturnType<RealIoEffect[ 'spawn' ]>;
type StatOpts = { log?: boolean };

export class RealIoEffect implements IoEffect {

    private logger = console;
    private logAllowed = process.env[ 'TUMAL_LOG_IO' ];

    constructor(logger?: Console) {
        if (logger) this.logger = logger;
    }

    private logDebug(opts?: StatOpts, ...args: any[]) {
        if (this.logAllowed && (!opts || opts.log || opts.log === undefined)) {
            this.logger.debug(...args);
        }
    }

    stat(path: fs.PathLike, opts?: StatOpts): Promise<fs.Stats> {
        this.logDebug(opts, 'stat', { path });
        return stat(path);
    }

    readFile(path: fs.PathLike): Promise<string> {
        this.logDebug({}, 'readFile', { path });
        return readFile(path, { encoding: 'utf8' });
    }

    writeFile(path: fs.PathLike, content: string): Promise<void> {
        this.logDebug({}, 'writeFile', { path, contentLength: content.length });
        return writeFile(path, content);
    }

    exec(command: string, options?: child_process.ExecOptions): Promise<ExecReturn> {
        this.logDebug({}, 'exec', { command, options, cwd: process.cwd() });
        return exec(command, options);
    }

    execStream(command: string, options?: child_process.ExecOptions) {
        this.logDebug({}, 'execStream', { command, options, cwd: process.cwd() });
        const child = child_process.exec(command, options);
        const finish = makePromise<number | string>();
        child.on('error', (err) => finish.resolve(err.stack || err.toString()));
        child.on('exit', (code, signal) => finish.resolve(code === null ? signal : code));
        return {
            child,
            finish: finish.promise,
        };
    }

    spawn(command: string, args?: ReadonlyArray<string>, options?: child_process.SpawnOptions) {
        const logOptions = { ...options };
        if (logOptions.env) logOptions.env = diffObject(logOptions.env, process.env)
        this.logDebug({}, 'spawn', { command, args, options: logOptions, cwd: process.cwd() });

        const child = child_process.spawn(command, args, options);
        const finish = makePromise<number | string>();
        child.on('error', (err) => finish.resolve(err.stack || err.toString()));
        child.on('exit', (code, signal) => finish.resolve(code === null ? signal : code));
        return {
            child,
            finish: finish.promise,
        };
    }

    globSync(pattern: string, options?: glob.IOptions): string[] {
        this.logDebug({}, 'globSync', { pattern, options, cwd: process.cwd() });
        options = Object.assign({ cwd: '.' }, options);
        return glob.sync(pattern, options);
    }

    createWriteStream(path: fs.PathLike, options?: string | { flags?: string; encoding?: string; fd?: number; mode?: number; autoClose?: boolean; start?: number; }): fs.WriteStream {
        this.logDebug({}, 'createWriteStream', { path, options, cwd: process.cwd() });
        return fs.createWriteStream(path, options);
    }

    mangle(str: string): string {
        return str.match(/\w+/g).join('-') || 'NO-NAME';
    }

    async mkdir(path: string) {
        if (!await exists(path)) {
            return await mkdir(path);
        }
    }
}

function diffObject(focus: AnyObject, base: AnyObject): AnyObject {
    const diff = {};
    const keys = new Set(Object.keys(focus).concat(Object.keys(base)));

    for (const key of keys) {
        if (focus[ key ] !== base[ key ]) {
            diff[ key ] = focus[ key ];
        }
    }

    return diff;
}