import { Target } from "./types";
import { IoEffect } from "./io";
import * as path from 'path';

/*
.tumal/$stampfile.do
*/

export async function createRedoFiles(io: IoEffect, targets: Target[]): Promise<void> {
    const files = await makeRedoFiles(targets);
    const writeFiles = files.map(file => io.writeFile(file.path, file.content));
    await Promise.all(writeFiles);
}

//

async function makeRedoFiles(targets: Target[]): Promise<{ path: string, content: string }[]> {
    targets.forEach(t => t.deps = t.deps.map(d => targets.find(o => o.name === d)).filter(x => x) as any);

    const makeFilesPerTarget = targets.map(t => makeRedoFileForTarget(t));
    const filesPerTarget = await Promise.all(makeFilesPerTarget);

    const all = await makeRedoFileForTarget(new Target({
        name: 'all',
        deps: targets.reduce((a, b) => a.concat(b), []),
        stampFilepath: '.tumal/all'
    }));

    const build = await makeRedoFileForTarget(new Target({
        name: 'build',
        deps: targets.reduce((a, b) => b.name.startsWith('build-') ? a.concat(b) : a, []),
        stampFilepath: '.tumal/build'
    }));

    return [ ...filesPerTarget, all, build ];
}

async function makeRedoFileForTarget(target: Target) {
    const deps = target.deps as any || [];
    const srcs = await target.srcs || [];
    const lines = [
        `cd $REDO_BASE`,
        `redo-ifchange ${deps.map(dep => `'${dep.stampFilepath}'`).join(' ')}`,
        `redo-ifchange ${srcs.map(src => `'${path.normalize(src)}'`).join(' ')}`,
        target.cmd ? target.cmd.script : '',
    ];
    const content = lines.join('\n');
    return { path: `${target.stampFilepath}.do`, content };
}
