"use client";

import {
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
  { icon: MessageSquare, title: "Customer enquiry", description: "A customer reaches out with a question or request." },
  { icon: Bot, title: "AI receptionist", description: "Drafts a helpful, business-appropriate response." },
  { icon: FileText, title: "Business instructions & FAQ", description: "Your own guidance shapes every reply." },
  { icon: Clock, title: "Scheduling rules", description: "Business hours, duration and blocked periods are respected." },
  { icon: ClipboardList, title: "Contacts / Conversations / Appointments", description: "Everything is organized and linked automatically." },
  { icon: LayoutDashboard, title: "Staff dashboard", description: "Your team reviews and manages it all in one place." },
];

const coreFeatures = [
  {
    icon: Users,
    title: "Contact Management",
    description: "Organize customer records and contact information in one searchable workspace.",
  },
  {
    icon: MessageSquare,
    title: "Conversations",
    description: "Keep customer interactions organized and linked to the right contact.",
  },
  {
    icon: Calendar,
    title: "Appointment Management",
    description: "Create appointments, manage schedules and track appointment status.",
  },
  {
    icon: CalendarClock,
    title: "Business Scheduling",
    description: "Configure timezone, working days, business hours, default appointment duration and blocked periods.",
  },
  {
    icon: Bot,
    title: "AI Receptionist Controls",
    description: "Your business controls the receptionist instructions and FAQ content used to guide responses.",
  },
  {
    icon: Users2,
    title: "Team Workspace",
    description: "An organization-scoped workspace with owner, admin and member access behavior.",
  },
];

const useCases = [
  { title: "Clinics", description: "Administrative enquiries and appointment coordination only, for front-desk teams." },
  { title: "Salons & wellness businesses", description: "Booking coordination and customer communication." },
  { title: "Service businesses", description: "Organize enquiries and scheduling for on-site or in-office visits." },
  { title: "Consultation-based businesses", description: "Keep client conversations and appointments in sync." },
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
  {
    title: "Organized customer operations",
    description: "Keep contacts, conversations and appointments connected in one place.",
  },
  {
    title: "Consistent front-desk guidance",
    description: "Responses are shaped by your own receptionist instructions and FAQs.",
  },
  {
    title: "Scheduling built around your business",
    description: "Configure hours, appointment duration and blocked periods.",
  },
  {
    title: "Designed for team operations",
    description: "Owner, admin and member access supports organization-based workflows.",
  },
];

export default function Home(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <span className="text-sm font-bold text-white">AI</span>
            </div>
            <span className="text-lg font-bold text-gray-900">AI Customer Ops</span>
          </div>
          <nav aria-label="Main navigation" className="hidden items-center space-x-8 md:flex">
            {navLinks.map((link) => (
              <a className="text-gray-600 transition hover:text-gray-900" href={link.href} key={link.href}>
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
      <section className="container mx-auto px-4 py-20 sm:px-6 md:py-28 lg:px-8">
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

          <div aria-hidden="true" className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Today&apos;s workspace</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Contacts</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">Organized</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Conversations</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">Linked</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Appointments</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">Tracked</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Bot className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Receptionist</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">Business-guided</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works-heading" className="bg-gray-50 py-20" id="how-it-works">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl" id="how-it-works-heading">
            From customer enquiry to staff action
          </h2>
          <p className="mb-12 max-w-2xl text-gray-600">
            Messaging-channel integration is part of the platform direction. Today, every enquiry moves through
            the same organized workflow.
          </p>

          <ol className="space-y-4">
            {workflowSteps.map((step, index) => (
              <li className="flex items-start gap-4" key={step.title}>
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                    <step.icon aria-hidden="true" className="h-5 w-5 text-primary-700" />
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div aria-hidden="true" className="mt-1 h-8 w-px bg-gray-300" />
                  )}
                </div>
                <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-gray-900">{step.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Core features */}
      <section aria-labelledby="features-heading" className="bg-white py-20" id="features">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-3xl font-bold text-gray-900 md:text-4xl" id="features-heading">
            Core features
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature) => (
              <div
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-primary-300 hover:shadow-md"
                key={feature.title}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <feature.icon aria-hidden="true" className="h-5 w-5 text-primary-700" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard / operations */}
      <section aria-labelledby="operations-heading" className="bg-primary-50 py-20">
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
      <section aria-labelledby="use-cases-heading" className="bg-white py-20" id="use-cases">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl" id="use-cases-heading">
            Built for appointment-driven teams
          </h2>
          <p className="mb-12 max-w-2xl text-gray-600">
            Clinic use is strictly administrative: front-desk enquiries and appointment coordination. The
            platform does not provide diagnosis, treatment recommendations, medication advice, clinical
            decisions or emergency triage.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6" key={useCase.title}>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{useCase.title}</h3>
                <p className="text-gray-600">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business control */}
      <section aria-labelledby="business-control-heading" className="bg-gray-50 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex items-center gap-3">
            <ShieldCheck aria-hidden="true" className="h-8 w-8 text-primary-700" />
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl" id="business-control-heading">
              Your business rules stay in control.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {businessControls.map((control) => (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" key={control.label}>
                <control.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-600" />
                <span className="text-sm font-medium text-gray-900">{control.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section aria-labelledby="benefits-heading" className="bg-white py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-3xl font-bold text-gray-900 md:text-4xl" id="benefits-heading">
            Why teams use it
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm" key={benefit.title}>
                <CheckCircle2 aria-hidden="true" className="mb-3 h-6 w-6 text-primary-600" />
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Support */}
      <section aria-labelledby="support-heading" className="bg-primary-50 py-16">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-3 text-2xl font-bold text-gray-900" id="support-heading">
            Need help getting started?
          </h2>
          <p className="mx-auto mb-6 max-w-xl text-gray-600">
            Sign in to your workspace or create an account to begin configuring your business.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link className="button-primary" href="/signup">
              Get started
            </Link>
            <Link className="button-secondary" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="final-cta-heading" className="bg-white py-20">
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
