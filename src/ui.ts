import { Target, UserInterface, TumalExecOptions } from "./types";
import { FancyUi } from "./fancy-ui";
import { SimpleUi } from "./simple-ui";
import { IoEffect } from "./io";

export class UserInterfaceControl {

    ui: UserInterface | undefined;

    constructor(private io: IoEffect, private opts: TumalExecOptions) {
    }

    start(targets: Target[]) {
        this.stop();

        const ui = this.opts.ui;
        const isTTY = process.stdout.isTTY;

        if (ui === 'auto' && isTTY || ui === 'fancy') {
            this.ui = new FancyUi(this.io, targets);
        } else if (ui === 'auto' && !isTTY || ui === 'simple') {
            this.ui = new SimpleUi(this.io, targets);
        }
    }

    async update() {
        if (this.ui) await this.ui.update();
    }

    async stop() {
        if (this.ui) await this.ui.stop();
    }
}
