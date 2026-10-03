# ecc/build-error-resolver

Apply to build or typecheck failures. Reproduce using the approved command, read the full diagnostic, locate the responsible dependency/type/configuration boundary, and make the smallest in-scope correction. Preserve public behavior and existing architecture. Do not suppress diagnostics or disable checks as a shortcut. If resolution requires unapproved dependency or scope changes, return needsReplan with evidence. Run the focused failing check after the fix.
