# tumal build

```
Usage: tumal <command> [options]

Commands:
  tumal exec        run command for every package
  tumal yarn-run    run a package.json script with yarn for every package
  tumal yarn-build  run `yarn build` for every out-of-date package in dependency
                    order
  tumal was         provides you some targets to run
  tumal build       same as `was -t build-.*`
  tumal test        same as `was -t test-.*`

Options:
  --version                Show version number                         [boolean]
  -f, --force              runs the command, even when the target is not out of
                           date
  --only-show-targets      shows only the targets it would run  [default: false]
  --ui                    [choices: "auto", "fancy", "simple"] [default: "auto"]
  --targets, -t, --target  runs the command only for these targets and possibly
                           its dependencies.
                           separate by comma to specify multiple targets.
                           you can use regex syntax to match target names.
                                                                   [default: ""]
  --by-deps                runs the command in dependency order
  --use-srcs               the command reruns when source files have been
                           changed since the last time
  --color, --colors        enforce color mode
  --todo                   what to do with targets?
                           'run' to run targets
                           'makefile' to create a Makefile      [default: "run"]
  -h                       Show help                                   [boolean]
```