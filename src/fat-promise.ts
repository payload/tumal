export type FatPromise<T> = {
    resolve: (value?: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void,
    promise: Promise<T>,
};

export function makePromise<T>(): FatPromise<T> {
    let resolve: (value?: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { resolve, reject, promise };
}