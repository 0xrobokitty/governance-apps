# Proposal title and body

Authors enter a plain title and a separate Markdown body. Both become immutable on publication.
The title names the proposed decision. The title field rejects `Summary` as the whole title.

Both body examples are valid:

```markdown
Approve funding for the next research cycle.
```

```markdown
## Summary

Approve funding for the next research cycle.

## Specification

Publish the research findings at the end of the cycle.
```

Titles allow 140 visible characters. Summary paragraphs allow 500 visible characters.
The complete document allows 32,768 UTF-8 bytes. Existing link, attachment, and source safety checks still apply.
The editor reports body errors with body line numbers.

## Publication and recovery

The app escapes title punctuation and adds one H1 before the body.
The body remains exact. Preview, final review, content digest, and publication use the same assembled document.
The published schema remains `yearn.dao.proposal.v1`.

Existing saved reviews and exact-content imports still restore their original bytes.
Opening an imported review for editing separates its title and body for display.
If neither field changes, the original Markdown stays exact, including heading syntax and line endings.
The published review remains locked against edits.

## Integration notes

This change extends the shared content parser and updates the shared Markdown renderer.
The optional Summary heading is omitted with its paragraph when the detail header already shows the summary.
No transaction pipeline, hosting configuration, or deployment flag changes are required.

## Browser checks

Authoring setup can repeat once if a development reload destroys the page during fixture setup.
Other errors fail immediately. Review, publication, and transaction actions never repeat automatically.
Progress-state checks pause the browser clock before publication and advance each step explicitly.
