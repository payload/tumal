import { isString, isObject } from "util";
import * as path from 'path';
import { AnyObject } from "./types";

export interface PackageJsonFilter {
    (packageJson: PackageJson): boolean
}

export class PackageJson {
    constructor(private json: AnyObject, public path: string) {
    }

    dirname(): string {
        return path.dirname(this.path);
    }

    workspaces(): string[] {
        const { workspaces } = this.json;
        return this.isStringArray(workspaces) ? workspaces : [];
    }

    isStringArray(array: unknown): array is string[] {
        return Array.isArray(array) && array.every(isString);
    }

    name(): string {
        const { name } = this.json;
        return isString(name) ? name : "";
    }

    all_dependency_names(): string[] {
        const { dependencies, devDependencies } = this.json;
        return Array.from(new Set([
            ...(isObject(dependencies) ? Object.keys(dependencies) : []),
            ...(isObject(devDependencies) ? Object.keys(devDependencies) : []),
        ]));
    }

    scripts(): AnyObject {
        return isObject(this.json.scripts) ? this.json.scripts : {};
    }
}
