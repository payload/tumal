import { UserInterface, TargetState, Target } from "./types";
import chalk from "chalk";
import { createWriteStream } from "fs";
import { IoEffect } from "./io";

export class SimpleUi implements UserInterface {

    targetStates = new Map<string, TargetState>();

    constructor(private io: IoEffect, private targets: Target[]) {
    }

    async update() {
        const { targets, targetStates, nameWidth } = this;

        const status = (t, color, msg) => process.stdout.write(color(`${nameWidth(t.name)}    ${msg}\n`));

        const handlers = new Map<TargetState, (t: Target) => Promise<any> | any>([
            [ TargetState.NotOutOfDate, t => status(t, chalk.green, 'nothing to do') ],
            [ TargetState.Working, t => status(t, chalk.blueBright, 'working on it') ],
            [ TargetState.Success, t => status(t, chalk.green, 'success') ],
            [ TargetState.Waiting, t => status(t, chalk.gray, 'waiting on dependencies') ],
            [ TargetState.CantDo, t => status(t, chalk.red, 'can not do') ],
            [ TargetState.CheckOutOfDate, t => status(t, chalk.gray, 'check if out of date') ],
            [ TargetState.Failure, async t => {
                status(t, chalk.red, `begin of failure (${await t.cmdRun.finish})`);

                const log = await this.io.readFile(`${t.stampFilepath}.log`)
                process.stdout.write(log);

                status(t, chalk.red, `end of failure (${await t.cmdRun.finish})`);
            } ],
        ]);

        for (const target of targets) {
            if (target.state !== targetStates.get(target.name)) {
                targetStates.set(target.name, target.state);

                const handler = handlers.get(target.state);
                if (handler) await handler(target);
            }
        }
    }

    async stop() {
        // nothing to stop in this class of UserInterface
    }

    private nameWidth(name: string): string {
        return name + ' '.repeat(Math.max(0, 50 - name.length));
    }
}