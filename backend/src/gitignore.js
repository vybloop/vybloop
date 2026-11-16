import ignore from 'ignore';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Tests paths inside a repo against its gitignore rules: `.git/info/exclude`,
// the root `.gitignore` and any nested `.gitignore`, each nested file's
// patterns relative to its own directory and overriding its ancestors' (git's
// precedence). The global `core.excludesFile` is not consulted.
//
// The rules are read lazily, one directory at a time, and cached; call
// `invalidate()` after a `.gitignore` changes. Git's rule that nothing inside
// an ignored directory can be re-included is left to the caller — a watcher
// that never descends into an ignored directory gets it for free.
export function createGitignoreMatcher(root) {
  const rules = new Map(); // repo-relative dir ('' = root) -> Ignore | null

  const rulesFor = (dir) => {
    if (rules.has(dir)) return rules.get(dir);
    const files = [join(root, dir, '.gitignore')];
    if (dir === '') files.unshift(join(root, '.git', 'info', 'exclude'));
    let ig = null;
    for (const file of files) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      (ig ??= ignore()).add(text);
    }
    rules.set(dir, ig);
    return ig;
  };

  return {
    // `isDir` matters for directory-only patterns like `target/`; pass false
    // when unknown and such a pattern simply won't match yet.
    ignores(absPath, isDir) {
      const rel = relative(root, absPath);
      if (!rel || rel.startsWith('..')) return false;
      const parts = rel.split(sep);
      let ignored = false;
      for (let i = 0; i < parts.length; i++) {
        const ig = rulesFor(parts.slice(0, i).join('/'));
        if (!ig) continue;
        const sub = parts.slice(i).join('/') + (isDir ? '/' : '');
        const result = ig.test(sub);
        if (result.ignored) ignored = true;
        else if (result.unignored) ignored = false;
      }
      return ignored;
    },
    invalidate() {
      rules.clear();
    },
  };
}
