# Entry code support, October 14, 2026

Live admin: https://challenge.bakinggreatbread.com/admin

- Name and email search near the top shows each matching baker's existing private entry code, with Copy code and a mailto draft addressed to the registered email.
- The existing passcode check protects code lookup. Unauthorized access was tested and denied; all 78 registrations returned matching codes with valid authorization.
- Public navigation and a hero link make My entry & code easier to find. Signed-in bakers see their existing code; codes and lesson progress were not changed.
- All 74 active, non-test registrants received individual code emails through Gmail from henrysbreadkitchen@gmail.com. Each send returned a message ID. Temporary Gmail rate limits were handled with delayed sends and sent-mail checks before retrying. Four excluded/test registrations were omitted. A final database count still showed 74 active registrants and zero missing codes.
- Admin wording distinguishes Activities needing your review, Counted points, Points awaiting review, All 7 lessons done, and the roster. Registrations need no approval. Activity claims in the review queue need evidence checking; a drawn winner's YouTube lesson comments should be spot-checked.

This was a one-time code email dispatch. It does not enable automatic emails for future registrations. The existing feature/email-entry-recovery branch remains separate from main and was not released here.

Verification: JavaScript syntax, name/multiword/accent/email search, no matches, roster filtering, code copy, recipient/code pairing, authenticated passcode lookup, rejected wrong passcode, and live production HTML. Full browser testing was unavailable in this session.
