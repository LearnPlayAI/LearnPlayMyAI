# Token Stress Fixture

Use this fixture to validate no-summarization/token-budget failure behavior (`413` expected).

## Pattern
Repeat large, structured lesson sections with clear headings until document size exceeds configured model limits.

## Required Headings
- Course Title
- Overview
- Lesson 1
- Lesson 2
- Lesson 3
- Key Takeaways

## Expected Result
Topic analysis or generation should fail with explicit token-budget guidance and no hidden summarization.
