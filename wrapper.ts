export function tryAsync<TArgs extends unknown[], TResult>(
    f: (...args: TArgs) => Promise<TResult>,
    callback: ((args: TArgs) => void) = () => { },
): (...args: TArgs) => Promise<[false, TResult] | [true, unknown]> {
    return async function(...args: TArgs) {
        try {
            return [false, await f(...args)];
        } catch (e) {
            console.error(e);
            try {
                callback(args);
            } catch (e) {
                void e;
            }
            return [true, e];
        }
    };
}

export function trySync<TArgs extends unknown[], TResult>(
    f: (...args: TArgs) => TResult,
    callback: ((args: TArgs) => void) = () => { },
): (...args: TArgs) => [false, TResult] | [true, unknown] {
    return function(...args: TArgs) {
        try {
            return [false, f(...args)];
        } catch (e) {
            console.error(e);
            try {
                callback(args);
            } catch (e) {
                void e;
            }
            return [true, e];
        }
    };
}
