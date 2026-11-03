import { Plan } from './Plan';

export default function App() {
  return (
    <main className="px-10 py-12 text-stone-900">
      <header className="mx-auto max-w-3xl">
        <p className="text-xs font-medium tracking-widest text-stone-500 uppercase">Pricing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Plans that grow with you</h1>
        <p className="mt-2 text-sm text-stone-600">Start free. Upgrade when your team does.</p>
      </header>

      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-4">
        <Plan id="starter" name="Starter" price="$0" blurb="For side projects." features={['3 projects', 'Community support', 'Basic analytics']} />
        <Plan
          id="pro"
          name="Pro"
          price="$24"
          blurb="For growing products."
          features={['Unlimited projects', 'Priority support', 'Advanced analytics']}
          featured
        />
        <Plan id="team" name="Team" price="$79" blurb="For teams that ship." features={['Everything in Pro', 'SSO and audit log', 'Shared workspaces']} />
      </div>
    </main>
  );
}
