import logUpdate = require("log-update");
import * as cliSpinners from "cli-spinners";
import chalk, { Chalk } from "chalk";
import { UserInterface, Target, TargetState } from "./types";
import { IoEffect } from "./io";

export class FancyUi implements UserInterface {

    nextUiLoop: NodeJS.Timer | undefined;
    spinners = createSpinners()

    constructor(private io: IoEffect, private targets: Target[]) {
        this.uiLoop();
    }

    update() {
        // regularly update in a loop instead
    }

    stop() {
        clearTimeout(this.nextUiLoop);
        this.updateUi(Date.now(), true);
    }

    async updateUi(time: number, lastUpdate: boolean) {
        const { targets } = this;

        const wallclock = new Date().toLocaleTimeString();
        const snippets = await Promise.all(targets.map(t => this.renderTarget(t, time, lastUpdate)));
        const lines = snippets.reduce((a, b) => a.concat(b), []);

        logUpdate(...[ wallclock, ...lines ].map(l => l + '\n'));
    }

    async renderTarget(t: Target, time: number, lastUpdate: boolean): Promise<string[]> {
        const statusSymbol = this.getSpinnerFrame(t, time);
        const name = t.name + ' '.repeat(Math.max(0, 50 - t.name.length));
        const line = [ statusSymbol, name ].join(' ');

        const log = [];
        if (t.state === TargetState.Failure && lastUpdate) {
            const content = await this.io.readFile(`${t.stampFilepath}.log`)
                .catch(r => r.stack || r.toString());

            // filter funny control keys
            //  Esc[1K Clear line from cursor left
            //  Esc[2K Clear entire line
            const lines = content
                .trim()
                .split(/\r\n|\n/)
                .map(l => '\t' + l.replace(/\u001b\[2K|\u001b\[1G/g, ''))
            // Do you want to see the unicode ansi characters?
            // .map(l => l + '\n\t' + JSON.stringify(l.slice(1)))

            log.push(...lines);
        }

        return [ line, ...log ];
    }

    uiLoop() {
        const interval = 1000 / 10;

        this.updateUi(Date.now(), false);
        this.nextUiLoop = setTimeout(() => this.uiLoop(), interval);
    }


    private getSpinnerFrame(t: Target, time: number): string {
        const spinner = this.spinners.get(t.state || TargetState.Waiting);
        const { interval, frames } = spinner;
        const startTime = t.doingTime || 0;
        const frameNum = Math.floor((time - startTime) / interval) % frames.length;
        const frame = spinner.frames[ frameNum ];
        console.assert(frame);
        return frame;
    }
}

type Spinner = { interval: number, frames: string[] };

function createSpinners() {
    const frameOneWidth = (spinner) => spinner.frames[ 0 ].length
    const singleFrame = (frame): Spinner => ({ interval: 1, frames: [ frame ] })
    const mapFrames = (s, func): Spinner => ({ interval: s.interval, frames: s.frames.map(func) })
    const baseSpinner = cliSpinners.circleHalves;
    baseSpinner.interval = 1000 / 10;
    const makeFrame = (color: Chalk, str: string) => {
        const width = frameOneWidth(baseSpinner);
        const times = Math.max(str.length, Math.floor(width / str.length));
        return singleFrame(color(str.repeat(times)));
    }

    const spinnersList: [ TargetState, Spinner ][] = [
        [ TargetState.CheckOutOfDate, makeFrame(chalk.gray, '◎') ],
        [ TargetState.Waiting, makeFrame(chalk.gray, '◎') ],
        [ TargetState.CantDo, makeFrame(chalk.white, '◎') ],
        [ TargetState.Working, mapFrames(baseSpinner, f => chalk.cyan(f)) ],
        [ TargetState.Success, makeFrame(chalk.greenBright, '◉') ],
        [ TargetState.NotOutOfDate, makeFrame(chalk.green, '◉') ],
        [ TargetState.Failure, makeFrame(chalk.red, '◉') ],
    ]
    return new Map<TargetState, Spinner>(spinnersList);
}
