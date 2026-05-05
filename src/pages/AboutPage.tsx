import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Suit = 'S' | 'H' | 'D' | 'C';
type Card = { rank: number; suit: Suit };
type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const APP_VERSION = '0.0.0';
const APP_REVISION = 'rev-2026.05.05.1';

const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      deck.push({ rank, suit });
    }
  }
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const nextDeck = [...deck];
  for (let index = nextDeck.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextDeck[index], nextDeck[randomIndex]] = [nextDeck[randomIndex], nextDeck[index]];
  }
  return nextDeck;
};

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank - 2]}${SUIT_SYMBOL[card.suit]}`;
const getStreetBaseBet = (street: Street) => {
  if (street === 'preflop') return 20;
  if (street === 'flop') return 30;
  if (street === 'turn') return 40;
  if (street === 'river') return 50;
  return 20;
};

const evaluateFiveCards = (cards: Card[]) => {
  const sorted = [...cards].sort((left, right) => right.rank - left.rank);
  const counts = new Map<number, number>();
  sorted.forEach((card) => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));

  const grouped = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return right[0] - left[0];
  });

  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const uniqueRanks = Array.from(new Set(sorted.map((card) => card.rank))).sort((left, right) => right - left);

  let isStraight = false;
  let straightHigh = uniqueRanks[0];
  if (uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4) {
    isStraight = true;
  } else if (JSON.stringify(uniqueRanks) === JSON.stringify([14, 5, 4, 3, 2])) {
    isStraight = true;
    straightHigh = 5;
  }

  let category = 0;
  let tiebreakers: number[] = [];
  let name = 'High Card';

  if (isStraight && isFlush) {
    category = 8;
    tiebreakers = [straightHigh];
    name = 'Straight Flush';
  } else if (grouped[0][1] === 4) {
    category = 7;
    tiebreakers = [grouped[0][0], grouped[1][0]];
    name = 'Four of a Kind';
  } else if (grouped[0][1] === 3 && grouped[1][1] === 2) {
    category = 6;
    tiebreakers = [grouped[0][0], grouped[1][0]];
    name = 'Full House';
  } else if (isFlush) {
    category = 5;
    tiebreakers = sorted.map((card) => card.rank);
    name = 'Flush';
  } else if (isStraight) {
    category = 4;
    tiebreakers = [straightHigh];
    name = 'Straight';
  } else if (grouped[0][1] === 3) {
    category = 3;
    tiebreakers = [grouped[0][0], ...grouped.slice(1).map((entry) => entry[0])];
    name = 'Three of a Kind';
  } else if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    category = 2;
    const pairs = grouped.filter((entry) => entry[1] === 2).map((entry) => entry[0]).sort((left, right) => right - left);
    const kicker = grouped.find((entry) => entry[1] === 1)?.[0] || 0;
    tiebreakers = [...pairs, kicker];
    name = 'Two Pair';
  } else if (grouped[0][1] === 2) {
    category = 1;
    tiebreakers = [grouped[0][0], ...grouped.slice(1).map((entry) => entry[0])];
    name = 'One Pair';
  } else {
    category = 0;
    tiebreakers = sorted.map((card) => card.rank);
    name = 'High Card';
  }

  return { category, tiebreakers, name };
};

const compareScores = (
  left: { category: number; tiebreakers: number[] },
  right: { category: number; tiebreakers: number[] }
) => {
  if (left.category !== right.category) return left.category - right.category;
  const maxLen = Math.max(left.tiebreakers.length, right.tiebreakers.length);
  for (let index = 0; index < maxLen; index += 1) {
    const leftValue = left.tiebreakers[index] || 0;
    const rightValue = right.tiebreakers[index] || 0;
    if (leftValue !== rightValue) return leftValue - rightValue;
  }
  return 0;
};

const getBestHand = (cards: Card[]) => {
  let best = evaluateFiveCards(cards.slice(0, 5));
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const hand = evaluateFiveCards([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compareScores(hand, best) > 0) best = hand;
          }
        }
      }
    }
  }
  return best;
};

export default function AboutPage() {
  const [microTableOpen, setMicroTableOpen] = useState(false);
  const [showPokerCheatsheet, setShowPokerCheatsheet] = useState(false);
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [boardCards, setBoardCards] = useState<Card[]>([]);
  const [street, setStreet] = useState<Street>('idle');
  const [resultText, setResultText] = useState('');
  const [isDealing, setIsDealing] = useState(false);
  const [highlightedStreet, setHighlightedStreet] = useState<Street>('idle');
  const [potAmount, setPotAmount] = useState(0);
  const [playerStack, setPlayerStack] = useState(2000);
  const [dealerStack, setDealerStack] = useState(2000);
  const [handHistory, setHandHistory] = useState<string[]>([]);
  const [isDealerRevealActive, setIsDealerRevealActive] = useState(false);
  const [toCall, setToCall] = useState(0);
  const [actionTakenThisStreet, setActionTakenThisStreet] = useState(false);

  const statusLabel = useMemo(() => {
    if (street === 'idle') return 'Tap "Deal Hand" to start.';
    if (street === 'preflop') return 'Pre-flop: choose Next Street to reveal the flop.';
    if (street === 'flop') return 'Flop dealt: three community cards.';
    if (street === 'turn') return 'Turn dealt: fourth community card.';
    if (street === 'river') return 'River dealt: final community card. Showdown available.';
    return resultText;
  }, [street, resultText]);

  const dealHand = () => {
    setIsDealing(true);
    const shuffledDeck = shuffleDeck(buildDeck());
    setPlayerCards([shuffledDeck[0], shuffledDeck[2]]);
    setDealerCards([shuffledDeck[1], shuffledDeck[3]]);
    setBoardCards([]);
    setDeck(shuffledDeck.slice(4));
    setStreet('preflop');
    setHighlightedStreet('preflop');
    setResultText('');
    setHandHistory(['Hand started: blinds posted']);
    setIsDealerRevealActive(false);
    setPotAmount(30);
    setPlayerStack((previousValue) => Math.max(previousValue - 15, 0));
    setDealerStack((previousValue) => Math.max(previousValue - 15, 0));
    const openingBet = Math.random() > 0.45 ? getStreetBaseBet('preflop') : 0;
    setToCall(openingBet);
    setActionTakenThisStreet(false);
    setHandHistory((previousValue) => [
      ...previousValue,
      openingBet > 0 ? `Dealer opens for ${openingBet}` : 'Dealer checks option',
    ]);
    window.setTimeout(() => setIsDealing(false), 350);
  };

  const setupDealerPressure = (nextStreet: Street) => {
    const openingBet = Math.random() > 0.45 ? getStreetBaseBet(nextStreet) : 0;
    setToCall(openingBet);
    setActionTakenThisStreet(false);
    setHandHistory((previousValue) => [
      ...previousValue,
      openingBet > 0 ? `Dealer opens for ${openingBet}` : 'Dealer checks',
    ]);
  };

  const advanceStreet = () => {
    setIsDealing(true);
    if (street === 'preflop') {
      setBoardCards((previousCards) => [...previousCards, deck[0], deck[1], deck[2]]);
      setDeck((previousDeck) => previousDeck.slice(3));
      setStreet('flop');
      setHighlightedStreet('flop');
      setHandHistory((previousValue) => [...previousValue, 'Flop dealt']);
      setPotAmount((previousValue) => previousValue + 40);
      setPlayerStack((previousValue) => Math.max(previousValue - 20, 0));
      setDealerStack((previousValue) => Math.max(previousValue - 20, 0));
      setupDealerPressure('flop');
      window.setTimeout(() => setIsDealing(false), 350);
      return;
    }
    if (street === 'flop') {
      setBoardCards((previousCards) => [...previousCards, deck[0]]);
      setDeck((previousDeck) => previousDeck.slice(1));
      setStreet('turn');
      setHighlightedStreet('turn');
      setHandHistory((previousValue) => [...previousValue, 'Turn dealt']);
      setPotAmount((previousValue) => previousValue + 60);
      setPlayerStack((previousValue) => Math.max(previousValue - 30, 0));
      setDealerStack((previousValue) => Math.max(previousValue - 30, 0));
      setupDealerPressure('turn');
      window.setTimeout(() => setIsDealing(false), 350);
      return;
    }
    if (street === 'turn') {
      setBoardCards((previousCards) => [...previousCards, deck[0]]);
      setDeck((previousDeck) => previousDeck.slice(1));
      setStreet('river');
      setHighlightedStreet('river');
      setHandHistory((previousValue) => [...previousValue, 'River dealt']);
      setPotAmount((previousValue) => previousValue + 80);
      setPlayerStack((previousValue) => Math.max(previousValue - 40, 0));
      setDealerStack((previousValue) => Math.max(previousValue - 40, 0));
      setupDealerPressure('river');
      window.setTimeout(() => setIsDealing(false), 350);
      return;
    }
    if (street === 'river') {
      const playerBest = getBestHand([...playerCards, ...boardCards]);
      const dealerBest = getBestHand([...dealerCards, ...boardCards]);
      const compareResult = compareScores(playerBest, dealerBest);
      const winner = compareResult > 0 ? 'You win.' : compareResult < 0 ? 'Dealer wins.' : 'Split pot.';
      setResultText(`${winner} You: ${playerBest.name} vs Dealer: ${dealerBest.name}.`);
      setStreet('showdown');
      setHighlightedStreet('showdown');
      setIsDealerRevealActive(true);
      setToCall(0);
      setActionTakenThisStreet(true);
      if (compareResult > 0) {
        setPlayerStack((previousValue) => previousValue + potAmount);
      } else if (compareResult < 0) {
        setDealerStack((previousValue) => previousValue + potAmount);
      } else {
        const splitValue = Math.floor(potAmount / 2);
        setPlayerStack((previousValue) => previousValue + splitValue);
        setDealerStack((previousValue) => previousValue + (potAmount - splitValue));
      }
      setHandHistory((previousValue) => [...previousValue, `Showdown: ${winner.replace('.', '')}`]);
      window.setTimeout(() => setIsDealerRevealActive(false), 550);
      window.setTimeout(() => setIsDealing(false), 350);
      return;
    }
    setIsDealing(false);
  };

  const handleFold = () => {
    if (street === 'idle' || street === 'showdown') return;
    setHandHistory((previousValue) => [...previousValue, 'Player folds']);
    setDealerStack((previousValue) => previousValue + potAmount);
    setPotAmount(0);
    setToCall(0);
    setStreet('showdown');
    setHighlightedStreet('showdown');
    setResultText('You folded. Dealer takes the pot.');
    setActionTakenThisStreet(true);
  };

  const handleCheck = () => {
    if (street === 'idle' || street === 'showdown' || toCall > 0) return;
    setHandHistory((previousValue) => [...previousValue, 'Player checks']);
    setActionTakenThisStreet(true);
  };

  const handleCall = () => {
    if (street === 'idle' || street === 'showdown' || toCall <= 0) return;
    const callAmount = Math.min(toCall, playerStack);
    setPlayerStack((previousValue) => Math.max(previousValue - callAmount, 0));
    setPotAmount((previousValue) => previousValue + callAmount);
    setToCall(0);
    setHandHistory((previousValue) => [...previousValue, `Player calls ${callAmount}`]);
    setActionTakenThisStreet(true);
  };

  const handleRaise = () => {
    if (street === 'idle' || street === 'showdown') return;
    const streetRaiseSize = getStreetBaseBet(street);
    const raiseAmount = Math.min(playerStack, Math.max(streetRaiseSize, toCall + streetRaiseSize));
    if (raiseAmount <= 0) return;

    const nextPot = potAmount + raiseAmount;
    setPlayerStack((previousValue) => Math.max(previousValue - raiseAmount, 0));
    setPotAmount(nextPot);
    setHandHistory((previousValue) => [...previousValue, `Player raises ${raiseAmount}`]);

    const dealerWillCall = Math.random() > 0.35 && dealerStack > 0;
    if (!dealerWillCall) {
      setPlayerStack((previousValue) => previousValue + nextPot);
      setPotAmount(0);
      setToCall(0);
      setStreet('showdown');
      setHighlightedStreet('showdown');
      setResultText('Dealer folds to the raise. You win the pot.');
      setHandHistory((previousValue) => [...previousValue, 'Dealer folds']);
      setActionTakenThisStreet(true);
      return;
    }

    const dealerCallAmount = Math.min(raiseAmount, dealerStack);
    setDealerStack((previousValue) => Math.max(previousValue - dealerCallAmount, 0));
    setPotAmount((previousValue) => previousValue + dealerCallAmount);
    setToCall(0);
    setHandHistory((previousValue) => [...previousValue, `Dealer calls ${dealerCallAmount}`]);
    setActionTakenThisStreet(true);
  };

  const renderCardToken = (label: string, hidden = false) => (
    <span
      className={`inline-flex min-w-[52px] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold shadow-sm transition-all duration-300 ${
        hidden
          ? 'bg-slate-800 border-slate-600 text-slate-300'
          : 'bg-white/95 text-slate-900 border-slate-300'
      } ${isDealing ? 'translate-y-0.5 scale-[0.98]' : 'translate-y-0 scale-100'}`}
    >
      {hidden ? '🂠' : label}
    </span>
  );

  const renderChipStack = (amount: number, tone: 'emerald' | 'rose') => {
    const chips = Math.max(1, Math.min(6, Math.floor(amount / 300) + 1));
    const toneClasses = tone === 'emerald'
      ? 'bg-emerald-400/80 border-emerald-100/70'
      : 'bg-rose-400/80 border-rose-100/70';
    return (
      <div className="flex items-end gap-1">
        {Array.from({ length: chips }).map((_, chipIndex) => (
          <span
            key={`${tone}-${chipIndex}`}
            className={`inline-block h-3 w-6 rounded-full border ${toneClasses} shadow-sm`}
            style={{ transform: `translateY(${(chips - chipIndex - 1) * 2}px)` }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <button
            type="button"
            className="inline-flex rounded-full border border-transparent p-1 text-primary transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Toggle micro-table demo"
            onClick={() => setMicroTableOpen((previousValue) => !previousValue)}
          >
            <Info className="h-6 w-6" />
          </button>
          About TEd_trackIT
        </h1>
        <p className="text-muted-foreground">
          Inventory and asset operations for production teams, with personal/team workspaces, role-aware settings, and
          operational reporting.
        </p>
        <p className="text-xs text-muted-foreground/70">
          Version {APP_VERSION} · {APP_REVISION}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Profile</CardTitle>
          <CardDescription>Purpose, scope, and operating focus.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>TEd_trackIT tracks technical inventory, consumables, and movement across production, engineering, and field operations.</p>
          <p>Current core workflows include inventory + templates, secure cabinet check-in/out, workspace-aware settings, device profile reuse, reports, and durable logs.</p>
          <p>The app is tuned for both daily transactions and periodic planning tasks such as cost review, reconciliation, and decommissioning windows.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version & Build Notes</CardTitle>
          <CardDescription>Current product branch characteristics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Desktop runtime: Electron with renderer powered by Vite/React/TypeScript.</p>
          <p>Data modes: personal and team workspace context with role-aware editing behavior.</p>
          <p>Theme support: softened light/dark palettes and compact UI controls in General Settings.</p>
          <p>Persistence: local storage + Electron store, with Supabase cloud sync when enabled.</p>
        </CardContent>
      </Card>

      {microTableOpen && (
        <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-emerald-900/60 bg-[radial-gradient(circle_at_top,_#14532d,_#052e16_55%,_#03160c)] p-4 space-y-3 text-sm shadow-lg">
                <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_0%,_rgba(16,185,129,0.5),_transparent_45%)]" />
                <div className="relative">
                  <p className="mb-1 text-xs uppercase tracking-wide text-emerald-200/80">Dealer</p>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-emerald-100/90">
                    <span>Stack: {dealerStack}</span>
                    {renderChipStack(dealerStack, 'rose')}
                  </div>
                  <div className="flex gap-2">
                    {dealerCards.length === 0 && renderCardToken('??', true)}
                    {dealerCards.length > 0 &&
                      (street === 'showdown'
                        ? dealerCards.map((card, index) => (
                            <span
                              key={`dealer-${index}`}
                              className="transition-all duration-500"
                              style={{
                                transform: isDealerRevealActive ? 'perspective(600px) rotateY(180deg) scale(1.05)' : 'none',
                              }}
                            >
                              {renderCardToken(cardLabel(card))}
                            </span>
                          ))
                        : dealerCards.map((_, index) => <span key={`dealer-hidden-${index}`}>{renderCardToken('🂠', true)}</span>))}
                  </div>
                </div>
                <div className="relative">
                  <p className="mb-1 text-xs uppercase tracking-wide text-emerald-200/80">Board</p>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-emerald-100/90">
                    <span>Pot: {potAmount}</span>
                    <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-300/15 px-2 py-0.5">
                      Main Pot
                    </span>
                  </div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-emerald-100/80">
                    <span className="inline-flex items-center rounded border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5">
                      To Call: {toCall}
                    </span>
                    <span className="inline-flex items-center rounded border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5">
                      Street Bet: {getStreetBaseBet(street)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {boardCards.length === 0
                      ? renderCardToken('—', true)
                      : boardCards.map((card, index) => <span key={`board-${index}`}>{renderCardToken(cardLabel(card))}</span>)}
                  </div>
                </div>
                <div className="relative">
                  <p className="mb-1 text-xs uppercase tracking-wide text-emerald-200/80">Player</p>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-emerald-100/90">
                    <span>Stack: {playerStack}</span>
                    {renderChipStack(playerStack, 'emerald')}
                  </div>
                  <div className="flex gap-2">
                    {playerCards.length === 0
                      ? renderCardToken('—', true)
                      : playerCards.map((card, index) => <span key={`player-${index}`}>{renderCardToken(cardLabel(card))}</span>)}
                  </div>
                </div>
                <div
                  className={`relative rounded-md border px-3 py-2 text-xs transition-all duration-300 ${
                    highlightedStreet === 'showdown'
                      ? 'border-amber-400/60 bg-amber-300/10 text-amber-100'
                      : 'border-emerald-500/35 bg-emerald-950/35 text-emerald-100'
                  }`}
                >
                  {statusLabel}
                </div>
                {handHistory.length > 0 && (
                  <div className="rounded-md border border-emerald-700/35 bg-emerald-950/30 px-3 py-2 text-[11px] text-emerald-100/85">
                    <div className="mb-1 font-semibold uppercase tracking-wide">Hand History</div>
                    <div className="flex flex-wrap gap-1">
                      {handHistory.map((entry, entryIndex) => (
                        <span
                          key={`${entry}-${entryIndex}`}
                          className="inline-flex items-center rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5"
                        >
                          {entry}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={dealHand} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    {street === 'idle' ? 'Deal Hand' : 'Redeal'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCheck}
                    disabled={street === 'idle' || street === 'showdown' || isDealing || toCall > 0}
                    className="border-emerald-300/40 text-emerald-100 hover:bg-emerald-900/40"
                  >
                    Check
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCall}
                    disabled={street === 'idle' || street === 'showdown' || isDealing || toCall <= 0}
                    className="border-emerald-300/40 text-emerald-100 hover:bg-emerald-900/40"
                  >
                    Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRaise}
                    disabled={street === 'idle' || street === 'showdown' || isDealing || playerStack <= 0}
                    className="border-amber-300/50 text-amber-100 hover:bg-amber-900/40"
                  >
                    Raise
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFold}
                    disabled={street === 'idle' || street === 'showdown' || isDealing}
                    className="border-rose-300/50 text-rose-100 hover:bg-rose-900/40"
                  >
                    Fold
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={advanceStreet}
                    disabled={street === 'idle' || street === 'showdown' || isDealing || !actionTakenThisStreet}
                    className="border-emerald-300/40 text-emerald-100 hover:bg-emerald-900/40"
                  >
                    Next Street
                  </Button>
                </div>
                <button
                  type="button"
                  className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-950/55 text-emerald-100 hover:bg-emerald-900/65"
                  onClick={() => setShowPokerCheatsheet((previousValue) => !previousValue)}
                  aria-label="Toggle poker cheat sheet"
                  title="Cheat sheet"
                >
                  <Info className="h-4 w-4" />
                </button>
                {showPokerCheatsheet ? (
                  <div className="absolute bottom-14 right-3 w-80 max-w-[calc(100%-1.5rem)] rounded-md border border-emerald-300/40 bg-emerald-950/95 p-3 text-[11px] text-emerald-100 shadow-lg">
                    <p className="mb-1.5 font-semibold uppercase tracking-wide text-emerald-200/90">Cheat sheet</p>
                    <ol className="list-decimal space-y-1 pl-4">
                      <li>Preflop baseline: fold weak offsuit hands, play pairs and strong broadways.</li>
                      <li>Pot control: check/call small when unsure; avoid large hero calls with one pair.</li>
                      <li>Value first: when ahead, bet for value instead of slow-playing by default.</li>
                      <li>Bluff less, choose spots: bluff more on scare cards that fit your line.</li>
                      <li>If to-call is large and your hand is marginal, fold and wait for clearer edges.</li>
                      <li>After each block, note one mistake and one good fold.</li>
                    </ol>
                  </div>
                ) : null}
              </div>
            </div>
      )}
    </div>
  );
}
