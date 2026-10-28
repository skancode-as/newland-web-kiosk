# Agent skills

This directory is a distribution source for agent skills aimed at **consumer**
repos: apps that install and use `@skancode/newland-web-kiosk`, rather than
maintain this library. Each skill is self-contained and points to the package
README for exhaustive API details.

## Install

Copy the skill directory into the consumer repo:

```bash
mkdir -p .agents/skills
cp -R skills/newland-web-kiosk-integration .agents/skills/
```

Or install it globally for every project:

```bash
mkdir -p ~/.agents/skills
cp -R skills/newland-web-kiosk-integration ~/.agents/skills/
```

Zed discovers skills from `.agents/skills/` (project) and `~/.agents/skills/`
(global). A `skills/` folder in this library repo is not auto-loaded; copy from
it into one of those locations.
