# VybLoop

A vibe coding IDE with sandboxed claude code instances and UI for interacting with git and running projects.

## Github PAT

To add a PAT:
1. Go to github, click the avatar picture, select "settings", then go to "developer settings"
2. Create a fine grained PAT with "Administration Read/Write" (if you want to be able to create repos from VybLoop) and "Contents Read/Write" permissions (so it has access to commit code and push changes)
3. Add the environment variable to the .env file, e.g. `GITHUB_TOKEN=github_pat...`