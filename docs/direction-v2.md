# Polyglot — response to the v2 direction

Written against *Polyglot — Product Direction Update (v2)*. The original build spec
stands; this records what changed, what I pushed back on, and what I'd build next.

---

## 1. What shipped with this document

| Change | Status |
|---|---|
| Renamed to **Polyglot** (app name, scheme, sign-in) | done |
| **Today's Mission** replaces the old Today list | done |
| **Dump → Found** (route, tab, copy) | done |
| Algorithms hidden: no strength, interval, or due date anywhere in the UI | done |
| Phase 3: Feed, three card types, pack generator, sync worker | done |

The Vercel project id stays `mission-control` so the URL doesn't move. Only the
product name changed.

---

## 2. Naming: why **Found**

The brief asked for something better than Capture / Collect / Gather / Inbox /
Journal / Import / Vault / Brain Dump / Knowledge Inbox. Every one of those
names describes *the container*. The interesting thing isn't the container — it's
the act, out in the world, of noticing a word and deciding to keep it.

**Found** is the name.

- One syllable. It survives 2,000 sessions without wearing out.
- It's a question the app can ask: *what did you find today?*
- It's a noun the log can use: *nothing found yet today.*
- It carries the *objet trouvé* sense — a found object, picked up because it was
  worth picking up. That's exactly the emotional register: quiet, curatorial,
  adult.
- It implies the word already existed and you came across it. That's true, and it
  frames you as someone moving through the world rather than someone doing
  homework.

Runners-up, and why not:

| Name | Why it lost |
|---|---|
| **Field Notes** | Beautiful and on-brand, but two words in a five-tab bar, and it borrows a well-known notebook brand's identity. |
| **Sightings** | Lovely birdwatching metaphor. Slightly too clever; needs explaining once. |
| **Catch** | Immediate, but the fishing metaphor tips playful. |
| **Vault / Inbox** | Both describe storage. Storage is not the feeling. An inbox also implies obligation — something to clear. |
| **Journal** | Already what Record is. Two names for one idea. |

**A rename I'd also make, but haven't:** *Feed* is a social-media word, and Polyglot
is the opposite of a feed. **Deck** is the honest name — a deck of cards, physical,
finite, calm. Say the word and I'll change it; I left it alone because you didn't
ask.

---

## 3. Where I'd push back

Three things in the brief look right but would age badly. All three are worth
arguing about before they get built.

**The mastery tree is the weakest idea in the document.** A tree is a progress
bar wearing a costume. It grows monotonically, so it can only ever say "more" —
which means after a year it says nothing, because everything is full. It also
implies a hierarchy of topics that doesn't survive contact with real vocabulary
(is *coffee* under Food, Drinks, Café, or Morning?). Worse, it's the same
achievement psychology as XP with better art direction, and the brief explicitly
doesn't want that. See §6 for what I'd build instead.

**"The AI should remember me" is the best idea in the document and the easiest
to get wrong.** An assistant that says "last week you wanted to travel to
Finland" once is uncanny in a good way. One that says it every third session is a
parlour trick, and the moment you notice the trick, the whole product feels
cheap. Memory needs a *budget* — at most one callback per conversation, and only
when it's load-bearing. It should also be inspectable and editable: the user must
be able to see what the app believes about them and delete any of it. The
failure mode isn't forgetting. It's remembering wrongly and confidently.

**Estimated time is a promise you will break.** "Estimated Time 28 minutes" is on
the home screen now because you asked for it, and it's genuinely useful for
deciding whether you have time right now. But it will be wrong constantly, and a
number that's always wrong trains people to ignore the screen it's on. I'd
soften it to a band ("about half an hour") once there's real usage data to
calibrate against.

---

## 4. Voice: what's actually achievable

Ordered by ratio of value to build cost.

**Tier 1 — do these first.**

1. **Listening before speaking.** Every card can be heard, not just read. Native
   TTS (`expo-speech`) covers all five languages at zero cost and no latency.
   Trivial to build, and it fixes the biggest gap in a reading-only app.
2. **Shadowing.** Card plays, you repeat, you record, you hear both back-to-back.
   No scoring, no AI, no server. The comparison *is* the feedback — your own ear
   is a better judge than a confidence score, and it never argues with you.
   `expo-av` handles record and playback.

**Tier 2 — worth building once Check exists.**

3. **Voice input to Check.** Speak instead of typing in the daily conversation.
   Web Speech API on the web; `expo-speech-recognition` on device. The Check
   already grades text — this only changes how the text arrives.
4. **Voice output from Check.** The study partner speaks its side. Native TTS is
   passable; a real voice model is better and costs per minute.

**Tier 3 — resist for now.**

5. **Pronunciation scoring.** Genuinely hard, and the honest version is
   discouraging: per-phoneme scores on a tonal language you started last month
   will tell you you're bad at Chinese every single day. Azure and Speechace do
   this properly and charge for it. If it ships, it should grade *intelligibility*
   ("a Korean speaker would understand this"), not accent.
6. **Full duplex AI voice conversation.** Impressive, expensive per minute, and
   at odds with the two-minute Check. A five-year daily habit shouldn't have a
   meter running.

**The honest recommendation:** ship 1 and 2 in the next phase. They're a
weekend's work, they cost nothing to run, and shadowing is the single most
underrated practice technique in language learning. Everything else can wait for
evidence you want it.

---

## 5. The twenty (plus) ideas

The brief asked for at least twenty original ideas. These are grouped by what
they're *for*, and each notes roughly when it becomes buildable. The ones marked
◆ are the four I'd actually build first.

### Things that get better the longer you use them

1. **◆ The Sediment View.** Every word you've ever learned, in one continuous
   vertical column, oldest at the bottom, newest on top — like a core sample
   through rock. Scroll down and you're scrolling backwards through years. No
   labels, no dates until you tap. After five years it's a physical object with
   weight, and it took no design effort to grow — it accumulated. This is what a
   mastery tree wants to be.
2. **Your own frequency list.** After a year, the app knows which words *you*
   actually keep meeting. Not JLPT N5 — yours. Publishable as a personal
   dictionary, and a genuinely novel artefact: nobody else has this list.
3. **The forgetting graveyard.** A quiet page of words you learned and lost.
   Not shaming — archaeological. Tapping one revives it into the deck. Most
   apps hide their failures; showing them makes the successes mean something.
4. **Anniversary cards.** A card you learned exactly one year ago today appears
   in the deck, marked only by a small date. No fanfare. You'll remember where
   you were.
5. **The word that took longest.** Every language has one word that fought you
   for months. The app knows which. Naming it after you finally win is a better
   trophy than any badge.

### Things that use the five-language structure nobody else has

6. **◆ Root ancestry.** Tap the character on a Sino triple and see every other
   word in your collection built from the same character. 時 gives you 時間,
   時計, 一時. This is a graph only a polyglot app can draw, and it grows denser
   with every dump.
7. **The interference alarm.** The app can detect when you're producing Korean
   with Japanese grammar, because it has both. Instead of correcting, it shows
   the two structures side by side and lets the collision teach you.
8. **Cross-language cognate hunting.** Russian and Spanish share more Latin and
   Greek roots than people expect (революция / revolución). The app can surface
   these as free vocabulary across the pair you'd never connect yourself.
9. **The same sentence, five ways.** One thought rendered in all five languages,
   stacked. Not a translation exercise — a structural X-ray showing how
   differently five languages carve up one idea.
10. **Language-of-the-day interface.** The whole app's chrome switches to one
    language for a day. Total immersion, zero content cost, and the small
    friction of a familiar interface in an unfamiliar script is real practice.

### Things that respect how memory actually works

11. **◆ Sleep-edge scheduling.** Memory consolidates during sleep, and material
    reviewed shortly before bed consolidates measurably better. The app knows
    your usage times. Quietly weight the hardest items toward your last session
    of the day. Never explain this — it's exactly the invisible intelligence the
    brief asks for.
12. **Context-of-encounter replay.** You captured a word in a café. It should
    resurface preferentially when you're in a café — same time of day, same kind
    of place. Encoding specificity is one of the most robust findings in memory
    research and almost no app uses it. The context tags already exist.
13. **Desirable difficulty dial, hidden.** Occasionally show a card *just* before
    it's comfortable, so retrieval is effortful. Harder recall means stronger
    memory. Never surface this as a setting — it's the algorithm doing its job.
14. **Interleaving across languages on purpose.** Blocked practice feels better
    and works worse. Shuffling languages within a session feels harder and
    produces better retention. The app should do this quietly and never mention
    it.
15. **The generation effect.** Occasionally the card asks you to produce the word
    before showing it, rather than recognising it. Producing beats recognising by
    a wide margin, and it costs one extra tap.

### Things that make it feel like a place rather than a tool

16. **◆ The daily line.** One sentence a day, in whichever language you're
    strongest in. Not a journal entry — a single line. Five years later that's
    1,825 lines and a legitimate record of a life, in languages you couldn't
    write when you started. This is the Mirror's real form, and it's better than
    the Mirror.
17. **Seasonal vocabulary drift.** In December the deck leans toward winter,
    holidays, cold. In August, heat and travel. Nobody announces it; the app just
    feels like it knows what month it is.
18. **The empty chair.** A page listing the conversations you haven't had yet —
    "order coffee in Korean", "explain your job in Russian". Not tasks. A
    horizon. Items move off it when you report having done them for real.
19. **Ambient count.** A single number somewhere unobtrusive: how many words you
    could not read a year ago and can read now. No chart. One number, updated
    silently.
20. **Weather-matched sentences.** The example sentence on a card matches today's
    actual weather when it plausibly can. It's raining, the card says it's
    raining. Tiny, cheap, and it makes the app feel present.

### Things five years out

21. **Watch-face vocabulary.** One word on your wrist, changing hourly. No
    interaction, no notification, no streak. Glanceable ambient exposure — the
    smartwatch use case that isn't a nag.
22. **Reading-mode capture.** Share any text into Polyglot and it highlights only
    the words at your actual level — not too easy, not hopeless. Comprehensible
    input, computed from your real vocabulary rather than a generic level.
23. **The overheard word.** With microphone permission and on-device processing,
    the app notices a language being spoken near you and offers, later, the three
    words you'd have needed. Enormous privacy surface — on-device only, opt-in,
    nothing transmitted. But nobody has built it.
24. **Handwriting as recall.** Draw the character instead of tapping. Motor recall
    is a separate memory pathway from visual recognition, and for Hanzi it's the
    pathway that actually matters.
25. **The five-year book.** At the end, the app renders a printable, bound-quality
    volume: every session note, every mirror entry, the sediment column, the words
    that took longest. The app's final act is to become an object you keep after
    you stop needing the app. Nothing else in this category has an ending.

---

## 6. Instead of the mastery tree

The brief invites something better. Three candidates, best first.

**The sediment column** (idea 1). Vertical, chronological, ever-growing. It
encodes *time* rather than *achievement*, so it can't top out, can't be gamed, and
means more every year. It answers "how far have I come" with an honest physical
answer: look how far down you have to scroll.

**The constellation.** Words as points, edges drawn by shared roots and shared
contexts. The Sino triples make it genuinely three-dimensional — one node,
three languages. It gets denser rather than taller, which matches how vocabulary
actually works: you don't finish topics, you thicken connections. Harder to
render well, and risks looking like every other network graph.

**The tide chart.** Not what you've mastered — what's currently *live* in you. It
recedes when you're away and comes back in when you return. Honest about decay in
a way a tree never is. Emotionally riskier: it can show you shrinking, which is
true but might not be what you need at week three.

If only one gets built: sediment.

---

## 7. Answering the five-year questions

> *Will this still feel enjoyable after 2,000 sessions?*

The Feed will not. No card interface survives 2,000 sessions on novelty; it
survives on being fast and out of the way. The parts that will still feel good
are the ones that change: the daily line, the anniversary cards, the sediment
getting deeper. Build those and let the Feed be plumbing.

> *What becomes more valuable with time?*

The session notes. The mirrors. The word list. Every one of them is
user-generated and irreplaceable — that's the whole category. Nothing the app
*generates* becomes more valuable with time; only what you put in does. That's
the strongest argument for making Found the centre of the product and everything
else support.

> *Will users eventually ignore this feature?*

Anything that fires on a schedule without being asked. Notifications, streaks,
weekly reports. The report survives only if it says something you couldn't have
guessed.
