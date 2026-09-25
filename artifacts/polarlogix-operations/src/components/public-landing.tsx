import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Anchor,
  Boxes,
  ClipboardCheck,
  Compass,
  MapPinned,
  RadioTower,
  ShieldCheck,
  Snowflake,
  Users,
} from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type PublicLandingProps = {
  onStartDemo: () => void;
};

const platformModules = [
  {
    number: '01',
    title: 'Voyage planning',
    detail: 'Keep vessel, polar class, route, departure window, and ice-entry timing in one operational record.',
    icon: Anchor,
  },
  {
    number: '02',
    title: 'Station readiness',
    detail: 'Review base occupancy, personnel status, available assets, and supply coverage before a decision.',
    icon: Users,
  },
  {
    number: '03',
    title: 'Field sortie control',
    detail: 'Dispatch from a station, assign eligible crew, track expected returns, and close only when everyone is accounted for.',
    icon: RadioTower,
  },
  {
    number: '04',
    title: 'Cargo integrity',
    detail: 'Monitor manifests and cold-chain exceptions with the operational context needed to respond.',
    icon: Boxes,
  },
  {
    number: '05',
    title: 'Emergency coordination',
    detail: 'Apply server-enforced dispatch locks, recall workflows, and explicit recovery checks.',
    icon: Activity,
  },
  {
    number: '06',
    title: 'Decision record',
    detail: 'Keep approvals and operational changes attributable to a signed-in operator and assigned role.',
    icon: ClipboardCheck,
  },
];

const workflowSteps = [
  { index: '01', title: 'Plan', detail: 'Record the route, mission window, and readiness requirements.' },
  { index: '02', title: 'Authorize', detail: 'Use role-gated approvals and explicit operational decisions.' },
  { index: '03', title: 'Coordinate', detail: 'Maintain a shared view of station, voyage, cargo, and field records.' },
  { index: '04', title: 'Account', detail: 'Confirm returns, resolve exceptions, and retain the audit trail.' },
];

function MissionRouteGraphic() {
  return (
    <Card className="relative isolate overflow-hidden rounded-[1.75rem] border-[#284755] bg-[#0c2632] text-white shadow-[0_34px_100px_-44px_rgba(6,35,48,.8)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(54,145,151,.32),transparent_48%),linear-gradient(145deg,rgba(11,38,50,.4),rgba(6,23,34,.96))]" />
      <CardContent className="relative p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#82c5c5]">
              <span className="h-2 w-2 rounded-full bg-[#e7b755]" />
              Mission overview
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">Southern logistics corridor</h2>
            <p className="mt-1 text-xs text-slate-300">Illustrative network view · not live telemetry</p>
          </div>
          <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-200">
            Preview data
          </div>
        </div>

        <div className="relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a202b]/80">
          <div aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(142,190,194,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(142,190,194,.12)_1px,transparent_1px)] [background-size:32px_32px]" />
          <svg
            role="img"
            aria-label="Illustrative route from Cape Town to Antarctic research stations"
            viewBox="0 0 680 350"
            className="relative block h-[250px] w-full sm:h-[315px]"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="routeLine" x1="0" x2="1">
                <stop offset="0%" stopColor="#e7b755" />
                <stop offset="100%" stopColor="#74c6c5" />
              </linearGradient>
              <radialGradient id="polarGlow">
                <stop offset="0%" stopColor="#5fb7b6" stopOpacity=".3" />
                <stop offset="100%" stopColor="#5fb7b6" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="490" cy="180" r="210" fill="url(#polarGlow)" />
            <g fill="none" stroke="#8db3b8" strokeOpacity=".2" strokeWidth="1">
              <path d="M-20 76 C118 28 237 32 354 86 S566 137 710 78" />
              <path d="M-20 111 C118 63 237 67 354 121 S566 172 710 113" />
              <path d="M-20 146 C118 98 237 102 354 156 S566 207 710 148" />
              <path d="M-20 181 C118 133 237 137 354 191 S566 242 710 183" />
              <path d="M-20 216 C118 168 237 172 354 226 S566 277 710 218" />
              <path d="M-20 251 C118 203 237 207 354 261 S566 312 710 253" />
              <path d="M-20 286 C118 238 237 242 354 296 S566 347 710 288" />
            </g>
            <path d="M96 245 C207 232 226 197 304 194 S414 214 480 165 S545 124 595 107" fill="none" stroke="#0a1119" strokeOpacity=".55" strokeWidth="10" />
            <path d="M96 245 C207 232 226 197 304 194 S414 214 480 165 S545 124 595 107" fill="none" stroke="url(#routeLine)" strokeDasharray="5 9" strokeLinecap="round" strokeWidth="3" />
            <g>
              <circle cx="96" cy="245" r="8" fill="#e7b755" stroke="#fff" strokeWidth="3" />
              <circle cx="304" cy="194" r="8" fill="#73c3c1" stroke="#fff" strokeWidth="3" />
              <circle cx="480" cy="165" r="8" fill="#73c3c1" stroke="#fff" strokeWidth="3" />
              <circle cx="595" cy="107" r="8" fill="#73c3c1" stroke="#fff" strokeWidth="3" />
            </g>
            <g fill="#d9e8e8" fontFamily="Manrope, sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.4">
              <text x="68" y="276">CAPE TOWN</text>
              <text x="278" y="222">MAITRI</text>
              <text x="457" y="193">BHARATI</text>
              <text x="570" y="81">HIMADRI</text>
            </g>
            <g fill="#7b9ba1" fontFamily="DM Mono, monospace" fontSize="9">
              <text x="32" y="38">60° S</text>
              <text x="32" y="330">78° S</text>
              <text x="596" y="323">SOUTHERN OCEAN</text>
            </g>
          </svg>
          <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-[#0b2632]/85 px-3 py-2 backdrop-blur">
            <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">Route state</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-bold"><span className="h-1.5 w-1.5 rounded-full bg-[#e7b755]" />Planning view</div>
          </div>
          <div className="absolute bottom-4 right-4 hidden rounded-lg border border-white/10 bg-[#0b2632]/85 px-3 py-2 backdrop-blur sm:block">
            <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">Stations connected</div>
            <div className="mt-1 text-sm font-bold">Maitri · Bharati · Himadri</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['01', 'Voyage plan'],
            ['02', 'Station readiness'],
            ['03', 'Field accountability'],
          ].map(([number, label]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[.045] px-3 py-3">
              <div className="font-mono text-[9px] tracking-[.14em] text-[#e7b755]">{number}</div>
              <div className="mt-1 text-[10px] font-semibold leading-snug text-slate-200 sm:text-xs">{label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PublicLanding({ onStartDemo }: PublicLandingProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f4f7f5] text-[#142c38]">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(ellipse_at_8%_6%,rgba(66,148,150,.11),transparent_29%),radial-gradient(ellipse_at_94%_35%,rgba(231,183,85,.12),transparent_26%)]" />
      <header className="sticky top-0 z-40 border-b border-[#d8e2e0] bg-[#f7f9f7]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8 lg:px-12">
          <a href="#" data-testid="link-landing-home" className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#12323d] shadow-sm">
              <Snowflake size={20} className="text-[#e7b755]" />
            </span>
            <span>
              <span className="block text-[15px] font-extrabold tracking-[.08em]">POLARLOGIX</span>
              <span className="mt-0.5 block font-mono text-[9px] tracking-[.17em] text-[#60757b]">POLAR OPERATIONS</span>
            </span>
          </a>
          <nav aria-label="Landing page" className="hidden items-center gap-7 lg:flex">
            <a href="#platform" data-testid="link-landing-platform" className="text-xs font-semibold text-[#4d6269] transition-colors hover:text-[#075b66]">Platform</a>
            <a href="#workflow" data-testid="link-landing-workflow" className="text-xs font-semibold text-[#4d6269] transition-colors hover:text-[#075b66]">Mission lifecycle</a>
            <a href="#access" data-testid="link-landing-access" className="text-xs font-semibold text-[#4d6269] transition-colors hover:text-[#075b66]">Access & safety</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="h-10 rounded-xl bg-[#12323d] px-4 text-xs font-bold text-white hover:bg-[#1d4854]">
              <Link href="/sign-in" data-testid="link-sign-in">
                Sign in <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-[1440px] items-center gap-11 px-5 pb-16 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[.88fr_1.12fr] lg:gap-14 lg:px-12 lg:pb-24 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d8] bg-white/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#17606a] shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d4a13d]" />
              National Centre for Polar & Ocean Research
            </div>
            <h1 className="mt-7 max-w-3xl text-[clamp(3.2rem,6.5vw,6.7rem)] font-extrabold leading-[.94] tracking-[-.065em] text-[#132d39]">
              Every mission,<br />
              <span className="text-[#0c7376]">in context.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#536971] sm:text-lg sm:leading-8">
              PolarLogix brings voyage planning, station readiness, cargo oversight, field accountability, and command decisions into one operational workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-xl bg-[#dcae4b] px-5 font-bold text-[#182e38] shadow-[0_12px_24px_-16px_rgba(104,76,23,.75)] hover:bg-[#edc365]">
                <Link href="/sign-in" data-testid="link-command-centre">
                  Open Command Centre <ArrowRight size={16} />
                </Link>
              </Button>
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  data-testid="button-enter-demo"
                  onClick={onStartDemo}
                  className="h-12 rounded-xl border-[#b9cfce] bg-white/70 px-5 font-bold text-[#1e5159] hover:bg-white"
                >
                  Explore read-only demo
                </Button>
              )}
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#d9e3e1] pt-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#536971]"><ShieldCheck size={15} className="text-[#0b7478]" />Server-enforced role access</div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#536971]"><ClipboardCheck size={15} className="text-[#0b7478]" />Recorded decisions</div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#536971]"><Compass size={15} className="text-[#0b7478]" />Field-aware workflows</div>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-5 text-[#74868b]">
              Google sign-in verifies identity; operational permissions are assigned separately. Unknown accounts remain read-only until an administrator assigns a role.
            </p>
          </div>
          <MissionRouteGraphic />
        </section>

        <section className="border-y border-[#d6e1df] bg-white/65">
          <div className="mx-auto grid max-w-[1440px] gap-7 px-5 py-7 sm:px-8 md:grid-cols-[1.05fr_2fr] md:items-center lg:px-12">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#0b7478]">Built for coordinated operations</div>
              <p className="mt-2 text-sm leading-6 text-[#51676e]">A shared record for planned activity, approvals, exceptions, and verified returns.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['04', 'role tiers'],
                ['10', 'operation scopes'],
                ['UTC', 'decision timestamps'],
                ['1', 'shared operating picture'],
              ].map(([value, label]) => (
                <div key={label} className="border-l border-[#d9e3e1] pl-4">
                  <div className="font-mono text-lg font-bold text-[#173743]">{value}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#74868b]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#0b7478]">The operational workspace</div>
              <h2 className="mt-3 text-3xl font-bold tracking-[-.04em] text-[#142f3b] sm:text-5xl">From first plan to final return.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#60757b]">Each module contributes to the same operating picture, so teams can see the decision context instead of piecing it together from separate logs.</p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {platformModules.map(({ number, title, detail, icon: Icon }) => (
              <Card key={number} data-testid={`card-landing-module-${number}`} className="group rounded-2xl border-[#dbe4e2] bg-white/90 shadow-[0_8px_26px_-20px_rgba(19,57,67,.3)] transition-all duration-200 hover:-translate-y-1 hover:border-[#9dc5c2] hover:shadow-[0_20px_38px_-24px_rgba(19,85,91,.25)]">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f1ef] text-[#0e7075] transition-colors group-hover:bg-[#d4e9e5]"><Icon size={20} /></span>
                    <span className="font-mono text-[10px] font-bold tracking-[.16em] text-[#a0b0b1]">{number}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-[#173743]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#60757b]">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="workflow" className="bg-[#102f3a] text-white">
          <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
            <div className="grid gap-9 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#e3b557]">Mission lifecycle</div>
                <h2 className="mt-3 max-w-lg text-3xl font-bold leading-tight tracking-[-.04em] sm:text-5xl">A clear chain of responsibility.</h2>
                <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">Operational actions are permission-checked by the API. A successful response is reflected back into the workspace and retained in the record.</p>
                <div className="mt-7 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-semibold text-slate-200">
                  <Snowflake size={15} className="text-[#e3b557]" />
                  Designed for remote, constrained operating environments
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {workflowSteps.map(step => (
                  <div key={step.index} className="rounded-2xl border border-white/10 bg-white/[.045] p-5 transition-colors hover:bg-white/[.075]">
                    <div className="font-mono text-[10px] font-bold tracking-[.16em] text-[#e3b557]">{step.index} / 04</div>
                    <h3 className="mt-3 text-base font-bold">{step.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="access" className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#0b7478]">Access & safety</div>
              <h2 className="mt-3 max-w-xl text-3xl font-bold leading-tight tracking-[-.04em] text-[#142f3b] sm:text-5xl">Identity is not the same as authority.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#60757b]">Signing in proves who the operator is. The external Clerk user record determines what they can do. If no recognized role is assigned, the account remains a viewer.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#dbe4e2] bg-white p-5">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf2f1] text-[#51676e]"><Users size={18} /></span><div className="text-sm font-bold">Scoped roles</div></div>
                <p className="mt-3 text-xs leading-5 text-[#60757b]">VIEWER, LOGISTICS, SAFETY, and COMMAND each have a defined permission set. COMMAND covers every operation scope.</p>
              </div>
              <div className="rounded-2xl border border-[#dbe4e2] bg-white p-5">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f7f0df] text-[#946c1d]"><ShieldCheck size={18} /></span><div className="text-sm font-bold">Server enforcement</div></div>
                <p className="mt-3 text-xs leading-5 text-[#60757b]">Buttons reflect permissions, but every protected mutation is independently checked by the API.</p>
              </div>
              <div className="rounded-2xl border border-[#dbe4e2] bg-white p-5 sm:col-span-2">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1ef] text-[#0e7075]"><MapPinned size={18} /></span><div className="text-sm font-bold">Read-only preview</div></div>
                <p className="mt-3 text-xs leading-5 text-[#60757b]">The development demo uses local illustrative fixtures only. It has no authenticated session, does not call protected operations APIs, and cannot issue commands.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-8 sm:pb-20 lg:px-12">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 rounded-[1.75rem] bg-[#dceae7] p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#0b7478]">PolarLogix operations</div>
              <h2 className="mt-2 text-2xl font-bold tracking-[-.035em] text-[#142f3b] sm:text-3xl">Bring the mission picture together.</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#536971]">Sign in with an account provisioned for the role you need, or explore the read-only development preview.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-xl bg-[#12323d] px-5 font-bold text-white hover:bg-[#1d4854]">
                <Link href="/sign-in" data-testid="link-footer-sign-in">Sign in to Command Centre <ArrowRight size={16} /></Link>
              </Button>
              {import.meta.env.DEV && (
                <Button type="button" size="lg" variant="outline" data-testid="button-footer-demo" onClick={onStartDemo} className="h-12 rounded-xl border-[#afc7c4] bg-white/70 px-5 font-bold text-[#1e5159]">
                  Open local demo
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#d9e3e1] bg-[#f8faf8]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-6 text-xs text-[#718388] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 font-semibold text-[#405a62]"><Snowflake size={14} className="text-[#0c7376]" />PolarLogix <span className="font-normal text-[#9aa9aa]">/</span> Operations workspace</div>
          <span>Illustrative map and demo records are not live navigation or safety data.</span>
        </div>
      </footer>
    </div>
  );
}