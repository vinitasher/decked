# Decked launch and recruitment kit

## Position

Decked helps engineers preparing for system design interviews practice individual architecture trade-offs in short daily sessions. Use it alongside complete design exercises and mock interviews.

**Headline:** Practice system design trade-offs in five minutes a day.

**Description:** Solve short architecture scenarios, compare the wiring, and revisit your weakest topics. Start free, without an account.

## First 20 learners

Recruit engineers with interviews in the next 2–8 weeks through your existing network and communities that allow recruitment. Send individual invitations; personalize why you thought of each person. Ask five volunteers to walk through their first session while you observe.

**Invitation draft**

Hey [name], I’m building Decked, a short daily practice app for system design trade-offs. Since you’re preparing for interviews, would you try one eight-question session and tell me which explanation helped or confused you? No account needed: https://decked.pages.dev/?utm_source=personal&utm_medium=outreach&utm_campaign=first_learners

If you’re willing, I’d also love to watch a 15-minute first session and hear your reasoning. No preparation required.

**Feedback prompts**

- What are you using to prepare, and when is your interview?
- What did you expect after opening this page?
- Which explanation was unclear, questionable, or useful?
- What would make you return tomorrow?
- After several sessions: where does this fit in your preparation?

**Follow-up draft — send only if they welcome a follow-up**

Thanks for trying Decked. Did you return for another session? I’m trying to understand whether the short drills earn a place in interview preparation. One useful explanation and one frustrating moment would help a lot.

## Show HN draft

**Title:** Show HN: Decked — adaptive system design drills with architecture diagrams

I built Decked to practice the small architecture decisions inside larger system design problems: where a queue belongs, when replica lag matters, and which constraints change a caching choice.

You choose an approach, compare architecture diagrams, and read the trade-offs. Sessions adapt to weaker topics and include spaced review. There’s also a Concept Lab for exploring bounded experiments.

It’s free to try without an account: https://decked.pages.dev/?utm_source=hackernews&utm_medium=launch&utm_campaign=first_learners

Source: https://github.com/vinitasher/decked

Content is AI-assisted, and I’m especially interested in feedback on ambiguous questions and explanation quality. These are decision drills alongside longer design practice. Which scenario would you want to see covered?

Follow https://news.ycombinator.com/showhn.html: submit the working app, be available to discuss it, and do not solicit votes.

## Educator invitation draft

Hi [name], your explanation of [specific topic] helped me think about how engineers practice trade-offs. I built Decked for short architecture decision drills, with diagrams and adaptive review.

Here’s a sample challenge: [paste one relevant scenario from challenges.md]. The app is at https://decked.pages.dev/?utm_source=educator&utm_medium=outreach&utm_campaign=first_learners

Would you be interested in trying a session and sharing feedback on the teaching quality? I’d welcome critique before discussing any collaboration.

## Four-week execution

1. Homepage and README: show the value and sample question. Record a 30-second walkthrough: open the app, start a session, answer, show the explanation and diagram. Capture a real session; do not imply features that are not present.
2. Recruit 15–20 learners and observe five first sessions. Fix the problems that prevent completion or undermine explanation trust.
3. Publish three challenge posts a week using challenges.md. Participate in replies and link only where promotion is permitted.
4. Launch on Show HN and personally contact a few relevant educators after incorporating learner feedback.

## Measurement

Initial experiment targets: 100 completed first sessions and 20 learners returning within seven days. These are planning targets, not benchmarks or forecasts.

Implement and verify analytics before interpreting traffic. Measure landing visits, session starts, completions, seven-day returns, and completed Pro purchases. Attribute visits using the UTM parameters in this kit. UTM links alone do not collect or report events; analytics is not implemented by this kit. Avoid sending question text, contacts, or account identifiers as event properties.

Keep a private recruitment tracker with consent, invitation date, first session, feedback, return, and next action. Do not commit personal contact details to this public repository.

## Publication checklist

- Confirm the deployed app has the new landing experience and accurate privacy copy.
- Complete an eight-question session on desktop and mobile.
- Review questions for correctness and ambiguous constraints.
- Record the demo and capture a real screenshot for social sharing.
- Verify analytics events and source attribution, if implemented.
- Publish and send outreach manually using the drafts above.
