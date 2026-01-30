import Link from 'next/link';

export default function HomePage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">StakeIt</h1>
        <Link
          href="/goals/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create Goal
        </Link>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
          Put Your Money Where<br />Your Mouth Is
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
          Create commitment contracts, stake real money, and let your friends
          hold you accountable. Complete your goals or lose your stake.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/goals/new"
            className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Create a Goal
          </Link>
          <a
            href="https://t.me/StakeItBot"
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors"
          >
            Use Telegram Bot
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
          How It Works
        </h3>
        <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          {[
            {
              step: '1',
              title: 'Set a Goal',
              desc: 'Define your commitment and how long you want to pursue it.',
              icon: '🎯',
            },
            {
              step: '2',
              title: 'Stake Money',
              desc: 'Put down real money via PromptPay to show you mean it.',
              icon: '💰',
            },
            {
              step: '3',
              title: 'Get Verified',
              desc: 'Your friends vote weekly on whether you completed your goal.',
              icon: '👥',
            },
            {
              step: '4',
              title: 'Win or Lose',
              desc: 'Pass majority of weeks and get your money back. Fail and lose it.',
              icon: '🏆',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
            >
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                Step {item.step}
              </div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {item.title}
              </h4>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platforms */}
      <section className="container mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
          Available On
        </h3>
        <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {[
            {
              name: 'Telegram',
              desc: 'Use our bot in any Telegram group.',
              icon: '📱',
            },
            {
              name: 'WhatsApp',
              desc: 'Send messages to our WhatsApp number.',
              icon: '💬',
            },
            {
              name: 'Web',
              desc: 'Create goals directly on this website.',
              icon: '🌐',
            },
          ].map((platform) => (
            <div
              key={platform.name}
              className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className="text-4xl mb-4">{platform.icon}</div>
              <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {platform.name}
              </h4>
              <p className="text-gray-600 dark:text-gray-400">{platform.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t border-gray-200 dark:border-gray-700 mt-16">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p>&copy; 2025 StakeIt. Put your money where your mouth is.</p>
        </div>
      </footer>
    </div>
  );
}
