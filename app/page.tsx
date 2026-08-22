"use client";

import { Fragment } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Users2,
} from "lucide-react";
import Link from "next/link";

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
];

const workflowSteps = [
  { icon: MessageSquare, title: "Customer enquiry" },
  { icon: Bot, title: "AI receptionist" },
  { icon: FileText, title: "Business rules & FAQ" },
  { icon: Clock, title: "Scheduling" },
  { icon: ClipboardList, title: "Organized records" },
  { icon: LayoutDashboard, title: "Staff action" },
];

const coreFeatures = [
  { icon: Users, title: "Contact management", description: "Organized customer records." },
  { icon: MessageSquare, title: "Conversations", description: "Interactions linked to each contact." },
  { icon: Calendar, title: "Appointments", description: "Schedules and status tracking." },
  { icon: CalendarClock, title: "Business scheduling", description: "Hours, duration and blocked periods." },
  { icon: Bot, title: "Receptionist controls", description: "Your instructions guide every reply." },
  { icon: Users2, title: "Team workspace", description: "Owner, admin and member access." },
];

const useCases = [
  {
    title: "Clinics",
    description: "Appointment coordination and administrative enquiries.",
    note: "Administrative and front-desk use only — not medical advice, diagnosis or treatment.",
  },
  { title: "Salons & wellness businesses", description: "Booking coordination and customer communication." },
  { title: "Service businesses", description: "Enquiries and scheduling for on-site or in-office visits." },
  { title: "Consultation-based businesses", description: "Client conversations and appointments in sync." },
  { title: "Small customer-service teams", description: "One shared workspace for contacts and conversations." },
];

const businessControls = [
  { icon: FileText, label: "Business profile" },
  { icon: Clock, label: "Working days and hours" },
  { icon: CalendarClock, label: "Timezone" },
  { icon: Calendar, label: "Default appointment duration" },
  { icon: ClipboardList, label: "Blocked periods" },
  { icon: Bot, label: "Receptionist instructions" },
  { icon: FileText, label: "FAQ" },
  { icon: Users2, label: "Team permissions" },
];

const benefits = [
  { title: "Organized customer operations", description: "Contacts, conversations and appointments stay connected." },
  { title: "Consistent front-desk guidance", description: "Replies follow your own instructions and FAQs." },
  { title: "Scheduling built around your business", description: "Hours, duration and blocked periods, respected." },
  { title: "Team-based workspace", description: "Owner, admin and member access for your team." },
];

export default function Home(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <span className="text-sm font-bold text-white">AI</span>
            </div>
            <span className="text-lg font-bold text-gray-900">AI Customer Ops</span>
          </div>
          <nav aria-label="Main navigation" className="hidden items-center space-x-8 md:flex">
            {navLinks.map((link) => (
              <a className="text-sm text-gray-600 transition hover:text-gray-900" href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link className="button-secondary" href="/login">
              Sign in
            </Link>
            <Link className="button-primary" href="/signup">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-primary-700" />
              <span className="text-sm font-medium text-primary-700">AI-powered customer operations</span>
            </div>
            <h1 className="mb-6 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
              Turn customer enquiries into organized conversations and appointments.
            </h1>
            <p className="mb-8 max-w-xl text-lg text-gray-600 sm:text-xl">
              Give your team one workspace for customer contacts, conversations, appointment scheduling and
              business-controlled AI receptionist workflows.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link className="button-primary" href="/signup">
                Get started
                <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
              </Link>
              <Link className="button-secondary" href="/login">
                Sign in
              </Link>
            </div>
          </div>

          <div aria-hidden="true" className="rounded-xl border border-gray-200 bg-white p-5 shadow-md">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
              <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700">Contacts</span>
              <span className="rounded-full px-3 py-1 text-xs font-medium text-gray-500">Conversations</span>
              <span className="rounded-full px-3 py-1 text-xs font-medium text-gray-500">Appointments</span>
              <span className="rounded-full px-3 py-1 text-xs font-medium text-gray-500">Business settings</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { status: "Open", statusClass: "bg-green-50 text-green-700" },
                { status: "Pending", statusClass: "bg-amber-50 text-amber-700" },
                { status: "Confirmed", statusClass: "bg-primary-50 text-primary-700" },
              ].map((row) => (
                <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3" key={row.status}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100" />
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-28 rounded-full bg-gray-200" />
                      <div className="h-2 w-16 rounded-full bg-gray-100" />
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.statusClass}`}>{row.status}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary-50 p-3">
              <Bot aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" />
              <p className="text-xs text-primary-800">Your AI receptionist replies using your own business rules.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works-heading" className="scroll-mt-20 bg-gray-50 py-16" id="how-it-works">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-3 text-3xl font-bold text-gray-900 md:text-4xl" id="how-it-works-heading">
            From customer enquiry to staff action
          </h2>
          <p className="mb-10 max-w-2xl text-gray-600">
            Messaging-channel integration is part of the platform direction. Today, every enquiry moves through
            the same organized workflow.
          </p>

          <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center md:justify-center">
            {workflowSteps.map((step, index) => (
              <Fragment key={step.title}>
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm md:w-36 md:flex-col md:gap-2 md:px-3 md:py-4 md:text-center">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100">
                    <step.icon aria-hidden="true" className="h-4 w-4 text-primary-700" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div aria-hidden="true" className="flex items-center justify-center text-gray-300">
                    <ArrowDown className="h-5 w-5 md:hidden" />
                    <ArrowRight className="hidden h-5 w-5 md:block" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Core features */}
      <section aria-labelledby="features-heading" className="scroll-mt-20 bg-white py-16" id="features">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-3xl font-bold text-gray-900 md:text-4xl" id="features-heading">
            Core features
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature) => (
              <div
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-primary-300 hover:shadow-sm"
                key={feature.title}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100">
                  <feature.icon aria-hidden="true" className="h-4 w-4 text-primary-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard / operations */}
      <section aria-labelledby="operations-heading" className="bg-primary-50 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl" id="operations-heading">
                One workspace for daily operations
              </h2>
              <p className="text-gray-600">
                Staff sign in to a single dashboard to review contacts, follow up on conversations, manage
                appointments, and adjust business scheduling and receptionist configuration.
              </p>
            </div>

            <div aria-hidden="true" className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Today&apos;s operations</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <Users aria-hidden="true" className="h-5 w-5 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Contacts</p>
                      <p className="text-xs text-gray-500">Customer records</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Organized</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <MessageSquare aria-hidden="true" className="h-5 w-5 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Conversations</p>
                      <p className="text-xs text-gray-500">Active customer interactions</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Open</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <Calendar aria-hidden="true" className="h-5 w-5 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Appointments</p>
                      <p className="text-xs text-gray-500">Upcoming bookings</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Pending</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-3">
                    <ClipboardList aria-hidden="true" className="h-5 w-5 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Business settings</p>
                      <p className="text-xs text-gray-500">Hours &amp; receptionist configuration</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Configured</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section aria-labelledby="use-cases-heading" className="scroll-mt-20 bg-white py-16" id="use-cases">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-2 text-3xl font-bold text-gray-900 md:text-4xl" id="use-cases-heading">
            Built for appointment-driven teams
          </h2>
          <p className="mb-8 max-w-2xl text-gray-600">Across service industries that run on scheduled customer visits.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5" key={useCase.title}>
                <h3 className="mb-1 text-base font-semibold text-gray-900">{useCase.title}</h3>
                <p className="text-sm text-gray-600">{useCase.description}</p>
                {useCase.note && <p className="mt-2 text-xs text-gray-500">{useCase.note}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built around your business */}
      <section aria-labelledby="business-control-heading" className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex items-center gap-3">
            <ShieldCheck aria-hidden="true" className="h-7 w-7 text-primary-700" />
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl" id="business-control-heading">
              Built around the way your business works
            </h2>
          </div>
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Your configuration</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {businessControls.map((control) => (
                  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3" key={control.label}>
                    <control.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="text-sm font-medium text-gray-900">{control.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">What you get</p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li className="flex items-start gap-3" key={benefit.title}>
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{benefit.title}</p>
                      <p className="text-sm text-gray-600">{benefit.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Support */}
      <section aria-labelledby="support-heading" className="bg-white py-16">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-3 text-2xl font-bold text-gray-900" id="support-heading">
            Need help getting started?
          </h2>
          <p className="mx-auto mb-4 max-w-xl text-gray-600">
            Configure your business profile, scheduling rules and receptionist guidance from your workspace.
          </p>
          <p className="text-sm text-gray-600">
            <Link className="font-medium text-primary-700 hover:text-primary-800 hover:underline" href="/signup">
              Get started
            </Link>
            {" "}or{" "}
            <Link className="font-medium text-primary-700 hover:text-primary-800 hover:underline" href="/login">
              sign in
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="final-cta-heading" className="bg-primary-50 py-20">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl" id="final-cta-heading">
            Bring your customer operations into one workspace.
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-gray-600">
            Organize contacts, conversations, appointments and receptionist settings from a single business
            workspace.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link className="button-primary" href="/signup">
              Get started
              <ArrowRight aria-hidden="true" className="ml-2 h-5 w-5" />
            </Link>
            <Link className="button-secondary" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
                  <span className="text-sm font-bold text-white">AI</span>
                </div>
                <span className="text-lg font-bold text-gray-900">AI Customer Ops</span>
              </div>
              <p className="max-w-sm text-sm text-gray-600">
                Customer operations and appointment workflow management.
              </p>
            </div>
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-8 gap-y-3 sm:justify-end">
              {navLinks.map((link) => (
                <a className="text-sm text-gray-600 hover:text-gray-900" href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
              <Link className="text-sm text-gray-600 hover:text-gray-900" href="/login">
                Sign in
              </Link>
              <Link className="text-sm text-gray-600 hover:text-gray-900" href="/signup">
                Get started
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
