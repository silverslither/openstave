export function tryAsync<TArgs extends unknown[], TResult>(
    f: (...args: TArgs) => Promise<TResult>,
    callback: string | (() => void) = () => {},
): (...args: TArgs) => Promise<[false, TResult] | [true, unknown]> {
    return async function(...args: TArgs) {
        try {
            return [false, await f(...args)];
        } catch (e) {
            console.error(e);
            if (typeof callback === "string")
                console.error(callback);
            else
                callback();
            return [true, e];
        }
    };
}

export function trySync<TArgs extends unknown[], TResult>(
    f: (...args: TArgs) => TResult,
    callback: string | (() => void) = () => {},
): (...args: TArgs) => [false, TResult] | [true, unknown] {
    return function(...args: TArgs) {
        try {
            return [false, f(...args)];
        } catch (e) {
            console.error(e);
            if (typeof callback === "string")
                console.error(callback);
            else
                callback();
            return [true, e];
        }
    };
}
