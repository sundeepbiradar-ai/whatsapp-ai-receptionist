"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

export default function Home(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="text-lg font-bold text-gray-900">AI Customer Ops</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition">
                Features
              </a>
              <a href="#architecture" className="text-gray-600 hover:text-gray-900 transition">
                Architecture
              </a>
              <a href="#docs" className="text-gray-600 hover:text-gray-900 transition">
                Docs
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="max-w-3xl">
          <div className="inline-block mb-4 px-3 py-1 bg-primary-100 rounded-full">
            <span className="text-sm font-medium text-primary-700">Phase 1 Foundation</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            AI Customer Operations
            <span className="block text-primary-600">Platform</span>
          </h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl">
            A production-grade, multi-tenant SaaS platform for AI-powered customer operations. Built
            with Next.js, TypeScript, and Supabase. Designed to scale across industries.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link className="button-primary" href="/signup">
              Get Started
              <ChevronRight className="ml-2 w-5 h-5" />
            </Link>
            <Link href="/dashboard" className="button-secondary">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
            Foundation Features
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Next.js 15",
                description: "Modern React framework with App Router",
              },
              {
                title: "TypeScript Strict",
                description: "Full type safety across the entire codebase",
              },
              {
                title: "Tailwind CSS",
                description: "Utility-first CSS for rapid UI development",
              },
              {
                title: "Component Library",
                description: "Reusable UI components with shadcn/ui",
              },
              {
                title: "Testing Ready",
                description: "Vitest for unit tests, Playwright for e2e",
              },
              {
                title: "Multi-Tenant Ready",
                description: "Foundation for multi-tenant architecture",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-lg border border-gray-200 hover:border-primary-300 transition"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
            Modular Monolith Architecture
          </h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Project Structure</h3>
              <div className="bg-gray-50 p-6 rounded-lg font-mono text-sm space-y-1 text-gray-700">
                <div>app/</div>
                <div>components/</div>
                <div>features/</div>
                <div className="ml-4">organizations/</div>
                <div className="ml-4">customers/</div>
                <div className="ml-4">conversations/</div>
                <div>lib/</div>
                <div className="ml-4">supabase/</div>
                <div className="ml-4">auth/</div>
                <div className="ml-4">utils/</div>
                <div>types/</div>
                <div>tests/</div>
                <div>docs/</div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Technology Stack</h3>
              <ul className="space-y-3">
                {[
                  "Frontend: React 18 + Next.js 15 App Router",
                  "Language: TypeScript with strict mode",
                  "Styling: Tailwind CSS + shadcn/ui",
                  "Database: Supabase PostgreSQL (Phase 2+)",
                  "Auth: Supabase Auth (Phase 2+)",
                  "Validation: Zod (Phase 2+)",
                  "Testing: Vitest + Playwright",
                  "CI/CD: GitHub Actions",
                ].map((item, index) => (
                  <li key={index} className="flex items-start text-gray-700">
                    <ChevronRight className="w-5 h-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation Section */}
      <section id="docs" className="bg-white py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">Documentation</h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Architecture Overview",
                description: "High-level system design and principles",
                href: "/docs/architecture",
              },
              {
                title: "Security Model",
                description: "Security foundation and best practices",
                href: "/docs/security",
              },
              {
                title: "Database Schema",
                description: "Database structure and design (Phase 2+)",
                href: "/docs/database",
              },
            ].map((doc, index) => (
              <a
                key={index}
                href={doc.href}
                className="p-6 rounded-lg border border-gray-200 hover:border-primary-600 hover:shadow-lg transition group"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-primary-600 transition">
                  {doc.title}
                </h3>
                <p className="text-gray-600">{doc.description}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-600 text-sm">
            <p>AI Customer Operations Platform © 2025. Phase 1 Foundation.</p>
            <p className="mt-2">Built with Next.js, TypeScript, and Tailwind CSS.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
