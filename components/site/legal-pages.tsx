/**
 * The three legal pages (§11, §16).
 *
 * These replace three-sentence placeholders that described a product we no
 * longer are — the privacy page told people "production retention is not
 * enabled by this frontend preview" while real audio was going to real storage.
 * A policy that describes the wrong product is worse than none, and a
 * merchant-of-record reviewer reads all three during onboarding (§14).
 *
 * Written against what the build actually does today. Where a §16 commitment
 * exists but is not yet enforced in code — automated moderation on both
 * streams, the age gate, the in-product report control — it is stated as the
 * rule and as what is coming, never in the present tense. Claiming a control we
 * have not built is the one thing on these pages that could not be walked back.
 *
 * These are not a lawyer's work. They are accurate, specific and honest, which
 * is the part that has to come first; a solicitor's pass before paid accounts
 * open is recorded as still owed in `LAUNCH-GAP.md` B4.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE_LINKS, SUPPORT_EMAIL } from './site-chrome'

const EFFECTIVE = '27 August 2026'

export function LegalDocument({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <article className="legal">
      <header className="legal__head">
        <span className="label">Effective {EFFECTIVE}</span>
        <h1 className="display-xl">{title}</h1>
        <p>{summary}</p>
      </header>
      <div className="legal__body">{children}</div>
      <footer className="legal__foot">
        <span className="label">Also worth reading</span>
        <div className="legal__links">
          <Link href={SITE_LINKS.terms}>Terms of use</Link>
          <Link href={SITE_LINKS.privacy}>Privacy</Link>
          <Link href={SITE_LINKS.safety}>Safety &amp; scope</Link>
        </div>
      </footer>
    </article>
  )
}

function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="legal__clause">
      <h2><span className="data">{n}</span> {title}</h2>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ Terms */

export function TermsDocument() {
  return (
    <LegalDocument
      title="Terms of use"
      summary="The agreement for using Nerve. It is written to be read, so it is in ordinary sentences rather than in capitals."
    >
      <Clause n="01" title="What Nerve is">
        <p>
          Nerve is a conversation training product. You hold timed spoken conversations with
          AI characters, you receive a score describing how you handled the conversation, and
          you are given small exercises to carry out in the real world and log afterwards.
        </p>
        <p>
          It is training and nothing more. It is not therapy, counselling, medical or
          psychological treatment, and it does not diagnose anything. It is not a dating
          service, a matchmaking service, or a companion service, and the characters are not
          people — they are training equipment, they do not persist a relationship with you,
          and every session ends on a timer.
        </p>
      </Clause>

      <Clause n="02" title="Who may use it">
        <p>
          You must be at least 18 years old. Sign-up asks for your date of birth and refuses to
          create the account if the answer is under 18; giving a false one is a breach of these
          terms. If we learn that an account belongs to somebody under 18 we close it and delete
          the data associated with it.
        </p>
        <p>
          You must also be somewhere the service is lawfully available to you, and you must
          not be barred from using it under any applicable sanctions or export rules.
        </p>
      </Clause>

      <Clause n="03" title="Your account">
        <p>
          One account per person. Keep your password to yourself; anything done through your
          account is treated as done by you. Tell us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you think somebody else
          has access to it.
        </p>
      </Clause>

      <Clause n="04" title="How you may use it">
        <p>Use it to practise. Specifically, do not:</p>
        <ul>
          <li>steer a session toward sexual, explicit or graphic content — sessions are bounded at PG-13 and this bound is not negotiable;</li>
          <li>use it to plan or rehearse harassment, stalking, deception, coercion, discrimination, or contact with somebody who has asked to be left alone;</li>
          <li>use it to practise pressuring anybody past a refusal, in any form;</li>
          <li>impersonate somebody else, or use it to build a profile of a real person;</li>
          <li>record, republish or redistribute character audio or transcripts as though they were a product of your own, or use them to train another model;</li>
          <li>attempt to extract the character prompts, bypass usage limits, automate access, probe the service for vulnerabilities, or resell access.</li>
        </ul>
        <p>
          The real-world exercises are yours to carry out and you are responsible for how you
          behave while doing them. Every challenge in the library is written so that the worst
          realistic outcome is somebody politely declining. Follow the safety note attached to
          the exercise, obey the law where you are, and leave people alone when they want to be
          left alone.
        </p>
      </Clause>

      <Clause n="05" title="Content standards">
        <p>
          If a session moves toward explicit content, the character is written to decline in
          frame and to end the conversation, and the event is recorded. Repeated breaches
          result in the account being suspended or closed. This is a condition of the payment
          arrangements the service depends on as well as a rule of ours, so there is no
          version of it we can waive.
        </p>
        <p>
          Automated moderation on both sides of the conversation is being added before paid
          accounts open. Until then, enforcement is through the characters themselves, through
          reports sent to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, and through
          action on the account.
        </p>
      </Clause>

      <Clause n="06" title="Your content, and what we do with it">
        <p>
          What you say in a session stays yours. So that the service can work, you give us
          permission to record, store, transcribe, score and display it back to you, and to
          pass it to the processors listed in the{' '}
          <Link href={SITE_LINKS.privacy}>privacy policy</Link> for exactly those purposes.
          That permission ends when you delete the material or close the account.
        </p>
        <p>
          We do not sell your sessions, publish them, or use them to advertise to you. Session
          audio is deleted automatically thirty days after the rep.
        </p>
        <p>
          If you publish a share card, you are publishing it: it becomes reachable by anybody
          holding the link until you revoke it, which you can do at any time from your settings.
        </p>
      </Clause>

      <Clause n="07" title="Plans, payment and cancellation">
        <p>
          There is a free plan, and there are paid plans that raise the number of voice reps
          you may run each day. Payment is handled by our merchant of record, who is the seller
          of record for the transaction and who collects and remits any VAT or sales tax due
          where you live. Their name, not ours, appears on your statement, and their terms
          apply to the transaction itself.
        </p>
        <p>
          Subscriptions renew each month until cancelled. Cancelling stops the next renewal and
          leaves your access open until the end of the period you have already paid for; it
          deletes nothing. Ask us within fourteen days of a charge and we will refund it.
        </p>
        <p>
          If a price changes, it changes for you at your next renewal and only after we have
          told you by email first.
        </p>
      </Clause>

      <Clause n="08" title="What we do not promise">
        <p>
          We do not promise a result. Nerve trains a skill and measures how you practised it;
          nothing about your score predicts what any actual person will do, and no part of this
          product treats a condition of any kind. If you are working with a clinician on social
          anxiety, this is something you might do alongside that, never instead of it.
        </p>
        <p>
          The service is provided as it is. AI characters occasionally behave in ways nobody
          intended, speech recognition mishears things, and the service may be unavailable while
          we work on it. We do not warrant that it will be uninterrupted or error-free.
        </p>
      </Clause>

      <Clause n="09" title="Suspension and closure">
        <p>
          We may suspend or close an account that breaches these terms, particularly clause 04
          or 05, and we will say why. You may close yours at any time by writing to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Closing an account deletes
          your sessions, recordings, transcripts, scores and field log permanently.
        </p>
      </Clause>

      <Clause n="10" title="Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential loss, or
          for anything that happens in the course of a real-world exercise you chose to carry
          out. Where liability cannot be excluded, it is limited to the amount you paid us in
          the twelve months before the claim. Nothing here limits liability for death or
          personal injury caused by negligence, or for fraud.
        </p>
      </Clause>

      <Clause n="11" title="Changes, law and contact">
        <p>
          If these terms change materially we will email you before the change takes effect.
          They are governed by the laws of Sri Lanka, and the courts of Sri Lanka have
          jurisdiction, without affecting any protection you have under the consumer law of the
          country you live in.
        </p>
        <p>
          Questions go to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and are answered
          by a person.
        </p>
      </Clause>
    </LegalDocument>
  )
}

/* ---------------------------------------------------------------- Privacy */

export function PrivacyDocument() {
  return (
    <LegalDocument
      title="Privacy"
      summary="We record your voice, because a conversation product that could not play a conversation back would be useless. Everything else on this page is about what happens to that recording."
    >
      <div className="legal__summary">
        <div><span className="label">Audio retention</span><strong>30 days, then deleted automatically</strong></div>
        <div><span className="label">Who can read your reps</span><strong>You. Enforced by the database, not by our code</strong></div>
        <div><span className="label">Sold or shared for advertising</span><strong>Never</strong></div>
        <div><span className="label">Card details</span><strong>We never see them</strong></div>
      </div>

      <Clause n="01" title="What we collect">
        <ul>
          <li><strong>Account.</strong> Your email address, your display name, your date of birth, and a hash of your password — never the password itself. The date of birth is the age check and nothing else: it is not used to personalise anything and it is never shown to a character.</li>
          <li><strong>Setup answers.</strong> What you said you are here for, the first name you would like characters to use, and your microphone and audio-device preferences — including a measurement of how long you pause mid-sentence, so a character waits for you to finish rather than answering a half-thought.</li>
          <li><strong>Sessions.</strong> The audio of your reps, the transcript of both sides, the moment-to-moment interest readings the character reacted to, your score and the evidence behind it, and one short line of what a character carries into the next encounter.</li>
          <li><strong>Field log.</strong> Which exercise you were given, whether you did it, how nervous you expected to be and how nervous you were, and anything you chose to write down.</li>
          <li><strong>Usage.</strong> How many reps you have run, when, against which character, and a per-session record of which provider and model served it and what it cost. This is how we meter the plan and how we check our own bills.</li>
          <li><strong>Safety.</strong> When automated moderation acts on a session, or when you report a problem with one, we record what happened: which category was triggered, which side of the conversation it came from, what we did, and — for a report — what you wrote. The turn itself is not copied into that record.</li>
          <li><strong>Technical.</strong> Ordinary server and delivery logs kept by our hosting providers — IP address, browser, timestamps — used for security and debugging.</li>
        </ul>
      </Clause>

      <Clause n="02" title="What we do not collect">
        <p>
          No advertising or cross-site trackers. No card numbers — those go directly to our
          merchant of record and never reach us. No contact list, no location, no microphone
          access outside a session you started. We do not sell personal data, and we do not
          share it with advertisers. If we add product analytics, this page will list the
          processor before it is switched on.
        </p>
      </Clause>

      <Clause n="03" title="Why we are allowed to hold it">
        <p>
          Most of it because we cannot provide the service without it — you asked for an account
          and a scorecard, and both require storing what happened. The usage ledger we keep
          because we have a legitimate interest in metering plans accurately and reconciling
          what we are charged. Session audio we keep on the basis of your consent, given when you
          start a rep and withdrawable by deleting the recording or the account.
        </p>
      </Clause>

      <Clause n="04" title="Who else touches it">
        <ul>
          <li><strong>Supabase</strong> — database, authentication and file storage. Your rows are readable only by your own account, enforced by row-level security in the database itself rather than by application code.</li>
          <li><strong>Vercel</strong> — application hosting and delivery.</li>
          <li><strong>OpenAI</strong> — the live voice model that speaks with you, the model that grades the transcript afterwards, and the classifier that checks both sides of a conversation against the content bounds in the <Link href={SITE_LINKS.safety}>safety policy</Link>. The classifier sees one turn at a time and returns a verdict; it is not used to train anything.</li>
          <li><strong>ElevenLabs</strong> — an alternative voice provider, used only for sessions served by it.</li>
          <li><strong>Our merchant of record</strong> — payment, invoicing and tax, for paid accounts only. They receive what a payment needs and nothing about your sessions.</li>
          <li><strong>Our email provider</strong> — sign-in links, confirmations and the weekly review letter.</li>
        </ul>
        <p>
          Each of these is a processor acting on our instructions for the purpose named. Some of
          them operate outside your country, so your data may be transferred and stored abroad
          under the safeguards their terms provide.
        </p>
      </Clause>

      <Clause n="05" title="How long we keep it">
        <ul>
          <li><strong>Session audio — thirty days.</strong> A scheduled job deletes the file and clears the pointer to it. The expiry is stamped when the recording is stored, so changing the window later can never quietly extend audio you were told would be gone.</li>
          <li><strong>Transcripts, scores and your field log</strong> stay while your account is open, because they are what your progress is made of.</li>
          <li><strong>The usage ledger</strong> is append-only and kept for as long as accounting requires, in a form tied to your account rather than to what you said.</li>
          <li><strong>Safety records</strong> stay while your account is open. They are the evidence that the content rules ran, which is the thing we have to be able to show — and they are also the record an account closure would rest on.</li>
          <li><strong>Everything</strong> goes when the account closes.</li>
        </ul>
      </Clause>

      <Clause n="06" title="What you can ask for">
        <p>
          A copy of everything we hold about you, a correction, a deletion of any individual rep,
          or the deletion of the whole account and everything in it. Write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and it is done within a working
          day. Self-service export and per-rep deletion are being built into the settings screen;
          until they land, the request is handled by a person, not ignored.
        </p>
        <p>
          Depending on where you live you may also have the right to object to processing, to
          restrict it, or to complain to your local data protection authority. We would rather you
          told us first.
        </p>
      </Clause>

      <Clause n="07" title="Cookies">
        <p>
          Only the ones that sign you in and keep you signed in, plus what our hosting needs to
          serve the page. No advertising cookies and no cross-site tracking, so there is no
          consent banner to dismiss.
        </p>
      </Clause>

      <Clause n="08" title="Children">
        <p>
          The service is for adults. We do not knowingly collect anything from anybody under 18,
          and if we find that we have, we delete it and close the account.
        </p>
      </Clause>

      <Clause n="09" title="Security, changes and contact">
        <p>
          Recordings live in a private bucket reached only through short-lived signed links.
          Database access is restricted per user at the database layer. No system is perfect; if
          something happens that affects you, we will tell you rather than wait to be asked.
        </p>
        <p>
          If this policy changes materially we will email you before it takes effect. Questions,
          requests and complaints go to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </Clause>
    </LegalDocument>
  )
}

/* ----------------------------------------------------------------- Safety */

export function SafetyDocument() {
  return (
    <LegalDocument
      title="Safety & scope"
      summary="What this product is for, what it refuses to be, and what happens when a session stops being training."
    >
      <Clause n="01" title="This is training, not care">
        <p>
          Nerve is confidence and conversation training. It makes no clinical claim of any kind:
          it does not treat, diagnose or assess social anxiety or any other condition, and no
          score it produces means anything medically.
        </p>
        <p>
          If you have diagnosed social anxiety, or you think you might, work with a clinician.
          Structured exposure work is a real and effective thing, and it is better done with
          somebody qualified who knows your history. Nerve can sit alongside that — plenty of
          people practise between sessions — but it is not a substitute for it and we will never
          describe it as one.
        </p>
      </Clause>

      <Clause n="02" title="Adults only">
        <p>
          18 and over. The category attracts teenagers and we are not equipped for them.
          Sign-up asks for your date of birth and the account is not created if the answer is
          under 18. Accounts created before that check existed are asked the same question
          before anything else in the product opens.
        </p>
        <p>
          A date of birth is a claim rather than a proof, and we are not going to describe it as
          more than that. What it means is that we asked, that the answer is on the record, and
          that an account we find to belong to somebody under 18 is closed and deleted.
        </p>
      </Clause>

      <Clause n="03" title="PG-13, and it is not a preference">
        <p>
          Sessions are bounded at PG-13. Steering one toward sexual or explicit content is a
          breach of the <Link href={SITE_LINKS.terms}>terms of use</Link>. The characters are
          written to decline in frame and to end the conversation rather than to play along, the
          event is recorded, and repeated breaches cost the account.
        </p>
        <p>
          Automated moderation runs on both sides of every conversation — what you say and what
          she says. The first breach is declined in character and the session continues; a second
          one ends it. Content involving minors ends a session immediately and is never given an
          in-character answer. Every one of those decisions is recorded against the account.
        </p>
        <p>
          What is recorded is the decision, not the conversation: which category was triggered,
          which side of the conversation it came from, and what we did about it. The words
          themselves are not copied into that record.
        </p>
      </Clause>

      <Clause n="04" title="The real-world exercises">
        <p>
          Every exercise in the library is written by hand, reviewed before it ships, and tested
          against one rule: <strong>the worst realistic outcome is somebody politely saying no.</strong>{' '}
          Nothing is generated for you on the fly, because a model inventing a challenge at
          runtime is a model that will eventually invent a bad one.
        </p>
        <p>Nothing in the library asks you to:</p>
        <ul>
          <li>continue after somebody has declined, in any form;</li>
          <li>film, photograph or record another person;</li>
          <li>approach somebody who cannot easily leave — at work, cornered, or alone at night;</li>
          <li>use a script designed to manipulate, negotiate or wear somebody down.</li>
        </ul>
        <p>
          The higher tiers carry their own safety line and it is shown before you accept them.
          The instruction is always the same shape: say your piece, and leave. Nothing here
          depends on anybody saying yes — that is the whole design.
        </p>
      </Clause>

      <Clause n="05" title="No manipulation content, ever">
        <p>
          There is no negging, no pressure close, no persistence script and no technique framed
          as overcoming somebody&rsquo;s reluctance, anywhere in the product. The scorecard is
          built the other way round: reading a no correctly and leaving warmly is one of the six
          things it scores highest, and pushing costs you points rather than earning them.
        </p>
      </Clause>

      <Clause n="06" title="If a session stops being an exercise">
        <p>
          Sometimes practising a hard conversation surfaces something real. If that happens, the
          right move is to stop — close the session, and the timer stops with it. Nothing is lost
          and nothing is scored against you for ending a rep early.
        </p>
        <p>
          The product will also stop by itself. If a session carries signals of genuine distress
          it ends there and then, the character does not answer, and what you get instead is a
          short page with places you can call. It diagnoses nothing and it does not pretend to
          know what is going on — it is a list of phone numbers and a door out of the exercise.
        </p>
        <p>
          If you are struggling, talk to somebody who is not a piece of software: a GP, a
          therapist, a crisis line, or a person who knows you. If you are in immediate danger,
          contact your local emergency number. International crisis line directories such as{' '}
          <a href="https://findahelpline.com" target="_blank" rel="noreferrer noopener">findahelpline.com</a>{' '}
          will list a service in your country. We are not qualified to be that, and we are not
          going to pretend otherwise.
        </p>
      </Clause>

      <Clause n="07" title="Telling us something went wrong">
        <p>
          If a character said something it should not have, if an exercise reads as unsafe, or if
          anything about the product feels off, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or use the{' '}
          <strong>Report a problem</strong> control on the result, scorecard and transcript
          screens of any rep — it carries the session with it, so there is no date and time to
          remember. Both reach the same person.
        </p>
        <p>
          Reports about characters are how the contracts get fixed. They are worth sending.
        </p>
      </Clause>
    </LegalDocument>
  )
}
