import { Target, TumalExecOptions, TargetState } from "./types";
import { makePromise } from "./fat-promise";
import { UserInterfaceControl } from "./ui";
import { IoEffect } from "./io";
import * as toposort from 'toposort';
import * as path from 'path';

export async function runTargets(targets: Target[], io: IoEffect, opts: TumalExecOptions) {
    const runner = new TargetRunner(targets, io, opts);
    return await runner.runTargets();
}

class TargetRunner {

    // TODO refactoring needed
    // targetsByName map only necessary because Target.deps is string[] and not Target[]
    targetsByName = new Map(this.targets.map(t => [t.name, t] as [string, Target]))

    ui = new UserInterfaceControl(this.io, this.opts)

    focus = this.targets

    constructor(private targets: Target[], private io: IoEffect, private opts: TumalExecOptions) {
        if (opts.targets.length > 0) {
            const regex = opts.targets.map(s => `^${s}$`).join('|');
            this.focus = targets.filter(t => t.name.match(regex));
        }

        let known = new Set(this.focus.map(t => t.name));
        let newDeps = this.focus.slice();
        while (newDeps.length > 0) {
            newDeps = newDeps
                .map(t => t.deps
                    .map(d => this.targetsByName.get(d))
                    .filter(d => d && !known.has(d.name) && known.add(d.name))
                ).reduce((a, b) => a.concat(b));
        }
        targets = Array.from(known.values()).map(name => this.targetsByName.get(name));

        this.targets = sortedByDependencyOrder(targets);
        this.setStampFilepaths(this.targets);
    }

    async runTargets(): Promise<void> {
        const { ui, targets } = this;

        ui.start(targets);

        if (!this.opts.onlyShowTargets) {
            await Promise.all(this.focus.map(t => this.doTarget(t)));
        }

        await ui.stop();
    }

    //

    private setStampFilepaths(targets: Target[]) {
        for (const target of targets) {
            target.stampFilepath = this.stampFilepath(target.name);
        }
    }

    private async doTarget(target: Target): Promise<void> {
        if (target.doing) {
            return await target.doing.promise;
        } else {
            target.doing = makePromise();

            try {
                await this._doTarget(target);
            } catch (e) {
                target.cmdRun = { finish: Promise.resolve(e.stack || e.toString()) };
                await this.changeTargetState(target, TargetState.Failure);
            }

            target.doing.resolve();
        }
    }

    private async _doTarget(target: Target): Promise<void> {
        const { targetsByName } = this;

        await this.changeTargetState(target, TargetState.Waiting);

        const dependencyNames = target.deps || [];
        const deps = dependencyNames.map(dep => targetsByName.get(dep)).filter(d => d);

        await Promise.all(deps.map(t => this.doTarget(t)));

        const depsDone = deps.every(t => t.state === TargetState.Success || t.state === TargetState.NotOutOfDate);

        if (!depsDone) {
            await this.changeTargetState(target, TargetState.CantDo);
        } else {
            await this.changeTargetState(target, TargetState.CheckOutOfDate);
            const outOfDate = await this.outOfDate(target);

            if (!outOfDate) {
                await this.changeTargetState(target, TargetState.NotOutOfDate);
            } else {
                target.doingTime = +Date.now();
                target.cmdRun = await target.cmd.func(target);

                await this.changeTargetState(target, TargetState.Working);

                const exitCode = await target.cmdRun.finish;
                const finishState = exitCode === 0 ? TargetState.Success : TargetState.Failure;

                if (finishState === TargetState.Success) {
                    target.doneTime = this.writeStamp(target);
                    await target.doneTime;
                }

                await this.changeTargetState(target, finishState);
            }
        }
    }

    private stampFilepath(name: string): string {
        return path.join('.tumal', name);
    }

    private async readStamp(stampFilepath: string): Promise<number> {
        try {
            const stat = await this.io.stat(stampFilepath);
            return stat.mtimeMs;
        } catch {
            return 0;
        }
    }

    private async writeStamp(target: Target): Promise<number> {
        try {
            await this.io.writeFile(target.stampFilepath, '');
            const stat = await this.io.stat(target.stampFilepath);
            return stat.mtimeMs;
        } catch (e) {
            console.error(`tumal ERROR: could not writeStamp to ${target.stampFilepath}`)
            return 0;
        }
    }

    private async changeTargetState(target: Target, state: TargetState): Promise<void> {
        target.state = state;
        await this.ui.update();
    }


    private async outOfDate(target: Target) {
        const srcs: string[] | undefined = await target.srcs;
        const deps: string[] | undefined = target.deps;

        if (!target.doneTime) {
            target.doneTime = this.readStamp(target.stampFilepath);
        }

        const doneTime = await target.doneTime;

        if (doneTime) {
            const newer = [];

            if (srcs) {
                const stats = await Promise.all(srcs.map((src) => this.io.stat(src, { log: false })));
                newer.push(...srcs.filter((_src, index) => stats[index].mtimeMs >= doneTime));
            }

            if (deps) {
                const doneTimes = await Promise.all(deps.map(name => {
                    const dep = this.targetsByName.get(name);
                    return dep && dep.doneTime;
                }));

                newer.push(...deps.filter((_name, index) => {
                    return doneTimes[index] >= doneTime;
                }));
            }

            return newer.length > 0;
        }

        return true;
    }
}

function sortedByDependencyOrder(targets: Target[]): Target[] {
    const names = new Set(targets.map(t => t.name));
    const edges = new Set(targets
        .map(t => (t.deps || [])
            .filter(d => names.has(d))
            .map(d => d + ' SPLIT ' + t.name))
        .reduce((a, b) => a.concat(b), [])
    );
    const edgePairs = Array.from(edges).map(s => s.split(' SPLIT '));
    const order = toposort(edgePairs) as string[];
    return targets.slice().sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}