import { Target } from "./types";
import { IoEffect } from "./io";

// Generates a GNU Make "Makefile" from a list of targets
// You can run it afterwards with `make`.
// Have a look at the Makefile targets too!
export async function createMakefile(io: IoEffect, targets: Target[], path: string): Promise<void> {
    const content = await makeMakefile(targets);
    await io.writeFile(path, content);
}

//

async function makeMakefile(targets: Target[]): Promise<string> {
    targets.forEach(t => t.deps = t.deps.map(d => targets.find(o => o.name === d)).filter(x => x) as any);

    const allChunk = await makeMakefileChunkCustom('all', targets.filter(t => t.name.match(/^build-/)));
    const testChunk = await makeMakefileChunkCustom('test', targets.filter(t => t.name.match(/^test-/)));
    const formatChunk = await makeMakefileChunkCustom('format', targets.filter(t => t.name.match(/^format-/)));
    const lintChunk = await makeMakefileChunkCustom('lint', targets.filter(t => t.name.match(/^lint-/)));
    const targetChunks = await Promise.all(targets.map(t => makeMakefileChunkTarget(t)));

    const chunks = [
        allChunk,
        testChunk,
        formatChunk,
        lintChunk,
        ...targetChunks,
    ];

    return chunks.reduce((a, b) => a.concat(b, [ '' ]), []).join('\n')
}

async function makeMakefileChunkCustom(name: string, targets: Target[]): Promise<string[]> {
    const stamps = targets.map(t => t.stampFilepath);
    return stamps.length ? [ `${name}: ${stamps.join(' ')}` ] : [];
}

async function makeMakefileChunkTarget(target: Target): Promise<string[]> {
    const srcs = await target.srcs;
    const deps = (target.deps as any).map(d => d.stampFilepath);
    const depsLines = target.deps.length ? [ `${target.stampFilepath}: ${deps.join(' ')}` ] : [];
    const srcsLines = srcs && srcs.length ? [ `${target.stampFilepath}: ${srcs.join(' ')}` ] : [];
    const scriptLines = target.cmd && target.cmd.script ? [ '\t' + target.cmd.script ] : [];

    return [
        ...depsLines,
        ...srcsLines,
        '',
        `${target.name}: ${target.stampFilepath}`,
        `${target.stampFilepath}:`,
        ...scriptLines,
        `\ttouch ${target.stampFilepath}`,
    ]
}