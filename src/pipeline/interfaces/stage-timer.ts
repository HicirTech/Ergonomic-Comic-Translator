/** Runs one piece of page work and adds its duration to the page's timing under `name`. */
export type StageTimer = <T>(name: string, work: () => Promise<T>) => Promise<T>;
