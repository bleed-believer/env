# @bleed-believer/env

Typed access to environment variables, with a `.env` file as a fallback for `process.env`.

- **Typed values:** the type of each value is inferred from how the variable is declared.
- **`process.env` wins:** the `.env` file only provides the variables that `process.env` doesn't have.
- **Lazy:** nothing is read or validated until you call `get`.
- **No dependencies:** parsing is done by Node's built-in [`util.parseEnv`](https://nodejs.org/api/util.html#utilparseenvcontent).

## Installation

```bash
npm install @bleed-believer/env
```

Requires Node.js 20.12 or later, and ESM (the package has no CommonJS build).

## Quick start

```ts
import { Env } from '@bleed-believer/env';

export const env = new Env('.env', {
    variables: {
        host:  { rawName: 'APP_HOST',  required: true },
        port:  { rawName: 'APP_PORT',  required: true, callback: v => parseInt(v, 10) },
        debug: { rawName: 'APP_DEBUG', callback: v => v === 'true' },
        token: { rawName: 'APP_TOKEN' }
    }
});

env.get('host');    // string
env.get('port');    // number
env.get('debug');   // boolean
env.get('token');   // string | undefined
env.get('other');   // compile error: "other" isn't declared
```

## Declaring variables

Each key in `variables` is the name you pass to `get`, and describes one environment variable:

| Property   | Type                   | Description                                                             |
| ---------- | ---------------------- | ----------------------------------------------------------------------- |
| `rawName`  | `string`               | Name of the variable in `process.env` and in the `.env` file.           |
| `required` | `boolean`              | When `true`, `get` throws if the variable isn't set in either source.   |
| `callback` | `(value) => any`       | Transforms the raw string before it's returned by `get`.                |

The value returned by `get` is typed as follows:

| Declaration                  | Callback receives      | `get` returns            |
| ---------------------------- | ---------------------- | ------------------------ |
| `required: true`             | -                      | `string`                 |
| optional                     | -                      | `string \| undefined`    |
| `required: true` + callback  | `string`               | the callback's return    |
| optional + callback          | `string \| undefined`  | the callback's return    |

A callback on an optional variable also runs when the variable is missing, so it can provide a default:

```ts
port: { rawName: 'APP_PORT', callback: v => parseInt(v ?? '3000', 10) }
```

### Declaring variables apart from the constructor

To keep the inferred types, declare the variables with `satisfies`, not with a type annotation:

```ts
import type { EnvVariables } from '@bleed-believer/env';
import { Env } from '@bleed-believer/env';

const variables = {
    host: { rawName: 'APP_HOST', required: true },
    port: { rawName: 'APP_PORT', required: true, callback: v => parseInt(v, 10) }
} satisfies EnvVariables;

const env = new Env('.env', { variables });
env.get('port');    // number
```

With an annotation (`const variables: EnvVariables = ...`), the declarations are lost: `get` accepts any name and returns `unknown`.

## Where values come from

For each call to `get`, the variable `rawName` is looked up in this order:

1. **`process.env`.** An empty value (`APP_HOST=`) counts as set.
2. **The `.env` file**, only when the variable isn't in `process.env`. If `process.env` has it, the file isn't read.

Keeping the `.env` file as a fallback means the variables set by your deployment (Docker, Kubernetes, CI…) always win over a local file.

About the file:

- A relative path is resolved against `process.cwd()`, not against the file that creates the `Env`.
- A missing file isn't an error: the variables are just unset. Any other read error (e.g. `EACCES`, or `EISDIR` when the path is a directory) is thrown by `get`.
- The syntax is the one supported by `util.parseEnv`: comments, blank lines, single, double and backtick quotes, multiline quoted values and the `export` prefix. A leading BOM is ignored.

## Caching

By default, the file is read and parsed again on every call to `get`, so changes to the file are picked up immediately. Set `cacheable: true` to read it only once:

```ts
const env = new Env('.env', {
    cacheable: true,
    variables: { /* ... */ }
});
```

With `cacheable: true`:

- The file is read on the first `get` that needs it, not in the constructor.
- A missing file is cached too.
- Read errors other than a missing file are never cached, so the next `get` tries again.
- `process.env` is never cached; changes to it are always visible.

## Errors

Every error is thrown by `get`, when the variable is read:

| Situation                                        | Message                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| The name isn't declared in `variables`           | `The variable "port" isn't declared in the "variables" option`        |
| A required variable is missing in both sources   | `The environment variable "APP_PORT" is required, but isn't set`      |
| A callback throws                                | `The callback of the variable "port" failed to process "APP_PORT"`   |
| The file exists but can't be read                | The original file system error (`EACCES`, `EISDIR`…)                  |

When a callback throws, the original error is available in `error.cause`. The raw value is never included in the messages, since it may be a secret.

Because nothing is validated up front, a missing required variable is only reported when it's read. To fail at startup, read the variables you need while your application boots.

## API

### `new Env(path, options)`

| Parameter           | Type           | Description                                          |
| ------------------- | -------------- | ---------------------------------------------------- |
| `path`              | `string`       | Path to the `.env` file.                             |
| `options.variables` | `EnvVariables` | The variables that `get` can read.                   |
| `options.cacheable` | `boolean`      | Read the file only once. Defaults to `false`.        |

### `env.get(name)`

Returns the value of the variable declared as `name`, following the rules above.

### `env.path`

The path given to the constructor, as is.

### Exported types

| Type                  | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `EnvOptions`          | The constructor options.                                           |
| `EnvVariables`        | The `variables` option. Use it with `satisfies`.                   |
| `EnvVariable`         | `EnvOptionalVariable \| EnvRequiredVariable`.                      |
| `EnvOptionalVariable` | A variable without `required: true`.                               |
| `EnvRequiredVariable` | A variable with `required: true`.                                  |
| `EnvValue<V>`         | The type returned by `get` for the variable `V`.                   |

## License

[MIT](./LICENSE)
