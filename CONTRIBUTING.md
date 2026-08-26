# Contributing

Thanks for your interest in improving `dsh-plugin-version-management`!

## Development Setup

1. Clone the repository.
2. Install the plugin locally into your DSH profile for testing:

   ```bash
   dsh plugin --profile web add "./pkg"
   ```

3. Restart DSH after each code change.

## Project Structure

```
pkg/
├── lib/
│   └── index.js          # Host entry: tools, HTTP API, snapshot/restore logic
├── client/
│   └── client.js         # Client bundle: settings page UI
├── cordis.patch.yml      # DSH bundle patch (plugin registration)
├── package.json          # Plugin manifest
└── screenshots.json      # Storefront screenshot list
```

## Code Style

- No build step — hand-written ES modules and plain React.createElement.
- Keep the host side dependency-free (only Node.js built-ins + Cordis ctx).
- Client side: use `window.__ModuleLoader__.load({...})` wrapper, no bundler.
- Prefer ASCII-only strings inside generated PowerShell/JS files to avoid encoding issues across locales.

## Submitting Changes

1. Fork the repo and create a branch.
2. Make your changes — keep commits focused and messages descriptive.
3. Test locally with `dsh plugin --profile web add ./pkg` and restart DSH.
4. Open a pull request with a clear description of what changed and why.

## Reporting Issues

- Include your DSH version and OS.
- Paste the full error message from the DSH console / dev tools.
- Mention whether you can reproduce it with a clean profile.
