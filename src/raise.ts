import * as yargs from "yargs";

import { Raise, GitSources } from './lib';
import { RealIoEffect } from "./io";

class RaiseCli {

    static main() {
        const cli = new RaiseCli();
        const argv = cli.argv();
        const [command,] = argv._;
        if (typeof cli[command] === 'function') {
            cli[command](argv);
        }
    }

    argv(): yargs.Arguments {
        return yargs
            .usage(`Usage: $0 <command> [options]`)
            .command('exec', 'run command for every package', yargs => yargs
                .positional('command', {})
            )
            .command('yarn-run', 'run a package.json script with yarn for every package', yargs => yargs
                .positional('script', {})
            )
            .help('h')
            .argv;
    }

    async exec(argv: yargs.Arguments): Promise<void> {
        const command = argv._.slice(1).join(' ');
        await this.raise().exec(command);
    }

    async 'yarn-run'(argv: yargs.Arguments): Promise<void> {
        const script = argv._[1];
        const args = argv._.slice(2);
        await this.raise().yarn_run(script, args);
    }

    private raise() {
        const ioEffect = new RealIoEffect();
        const sourceProvider = new GitSources(ioEffect);
        return new Raise(ioEffect, sourceProvider);
    }
}

RaiseCli.main();
