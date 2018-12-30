import * as yargs from "yargs";

import { Tumal } from './another';
import { RealIoEffect } from "./io";
import { TumalExecOptions } from "./types";

class TumalCli {

    static async main() {
        const cli = new TumalCli();
        const argv = cli.argv();
        const [ command, ] = argv._;
        if (typeof cli[ command ] === 'function') {
            await cli[ command ](argv);
        }
    }

    argv(): yargs.Arguments {
        return yargs
            .usage(`Usage: $0 <command> [options]`)
            .option('f', {
                alias: 'force',
                desc: 'runs the command, even when the target is not out of date',
            })
            .option('only-show-targets', {
                default: false,
                desc: 'shows only the targets it would run'
            })
            .option('ui', {
                default: 'auto',
                choices: [ 'auto', 'fancy', 'simple' ],
            })
            .option('targets', {
                alias: [ 't', 'target' ],
                default: '',
                desc: 'runs the command only for these targets and possibly its dependencies.'
                    + '\nseparate by comma to specify multiple targets.'
                    + '\nyou can use regex syntax to match target names.',
            })
            .option('by-deps', {
                desc: 'runs the command in dependency order',
            })
            .option('use-srcs', {
                desc: 'the command reruns when source files have been changed since the last time',
            })
            .option('color', {
                // these flags is handled by the `chalk/supports-color` library
                desc: 'enforce color mode',
                alias: 'colors',
            })
            .option('todo', {
                default: 'run',
                desc: `what to do with targets?\n'run' to run targets\n'makefile' to create a Makefile`,
            })
            .command('exec', 'run command for every package', yargs => yargs
                .positional('command', {})
                .default('force', true)
            )
            .command('yarn-run', 'run a package.json script with yarn for every package', yargs => yargs
                .positional('script', {})
                .default('force', true)
            )
            .command('yarn-build', 'run `yarn build` for every out-of-date package in dependency order', yargs => yargs
                .default('by-deps', true)
                .default('use-srcs', true)
            )
            .command('was', 'provides you some targets to run', yargs => yargs
                .default('targets', 'build-.*')
                .default('by-deps', true)
                .default('use-srcs', true)
            )
            .command('build', 'same as `was -t build-.*`', yargs => yargs
                .default('targets', 'build-.*')
                .default('by-deps', true)
                .default('use-srcs', true)
            )
            .command('test', 'same as `was -t test-.*`', yargs => yargs
                .default('targets', 'test-.*')
                .default('by-deps', true)
                .default('use-srcs', true)
            )
            .help('h')
            .argv;
    }

    async exec(argv: yargs.Arguments): Promise<void> {
        const command = argv._.slice(1);
        return tumal().exec(command, getOpts(argv));
    }

    async 'yarn-build'(argv: yargs.Arguments): Promise<void> {
        const args = argv._.slice(1);
        return tumal().yarnRun('build', args, getOpts(argv));
    }

    async 'yarn-run'(argv: yargs.Arguments): Promise<void> {
        const script = argv._[ 1 ];
        const args = argv._.slice(2);
        return tumal().yarnRun(script, args, getOpts(argv));
    }

    build = this.was
    test = this.was
    async was(argv: yargs.Arguments): Promise<void> {
        const opts = getOpts(argv);
        return tumal().was(opts);
    }
}

function tumal() {
    const ioEffect = new RealIoEffect();
    return new Tumal(ioEffect);
}

function getOpts(argv: yargs.Arguments): TumalExecOptions {
    let { force, targets, byDeps, useSrcs, todo, onlyShowTargets, ui } = argv;
    targets = targets.split(/\s*,\s*/).map(s => s.trim()).filter(s => s);
    return { force, targets, byDeps, useSrcs, todo, onlyShowTargets, ui };
}

TumalCli.main();
