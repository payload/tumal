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
            .command('exec', 'run command for every package', yargs => yargs.positional('command', {}))
            .help('h')
            .argv;
    }

    async exec(argv: yargs.Arguments): Promise<void> {
        const command = argv._.slice(1).join(' ');
        await this.raise().exec(command);
    }

    private raise() {
        const ioEffect = new RealIoEffect();
        const sourceProvider = new GitSources(ioEffect);
        return new Raise(ioEffect, sourceProvider);
    }
}

RaiseCli.main();
