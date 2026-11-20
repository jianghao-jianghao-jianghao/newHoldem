import { useId } from 'react';
import type { JokerKind, Rank, Suit } from '../shared/types';

interface CourtPortraitSvgProps {
  rank?: Rank;
  suit: Suit;
  joker?: JokerKind;
  className?: string;
}

interface CourtPalette {
  ink: string;
  primary: string;
  secondary: string;
  gold: string;
  goldLight: string;
  skin: string;
  skinShadow: string;
  hair: string;
  cream: string;
  bgTint: string;
}

function getCourtPalette(suit: Suit): CourtPalette {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  if (isRed) {
    return {
      ink: '#1E1517',
      primary: '#BD1E28',
      secondary: '#1C5B43',
      gold: '#D4A346',
      goldLight: '#F4DA8E',
      skin: '#F5D6B5',
      skinShadow: '#DFB38A',
      hair: '#5D331E',
      cream: '#FBF7EE',
      bgTint: '#F4ECDD',
    };
  }
  return {
    ink: '#151921',
    primary: '#1E3C72',
    secondary: '#AE1D27',
    gold: '#D4A346',
    goldLight: '#F4DA8E',
    skin: '#F4D5B3',
    skinShadow: '#DDB086',
    hair: '#3A2820',
    cream: '#FBF7EE',
    bgTint: '#EEECE5',
  };
}

function SuitEmblem({
  suit,
  x,
  y,
  scale = 1,
  fill,
}: {
  suit: Suit;
  x: number;
  y: number;
  scale?: number;
  fill: string;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} fill={fill}>
      {suit === 'spades' && (
        <path d="M0,-10 C-2.5,-5 -9.5,-0.5 -9,3.8 C-8.6,7.2 -3.2,7.6 -1.4,4.8 C-1.8,7.4 -2.6,9 -4,10 H4 C2.6,9 1.8,7.4 1.4,4.8 C3.2,7.6 8.6,7.2 9,3.8 C9.5,-0.5 2.5,-5 0,-10 Z" />
      )}
      {suit === 'hearts' && (
        <path d="M0,10 C-2.8,6.8 -10,1.8 -9.4,-3.2 C-8.8,-8 -2.6,-9 0,-4.4 C2.6,-9 8.8,-8 9.4,-3.2 C10,1.8 2.8,6.8 0,10 Z" />
      )}
      {suit === 'diamonds' && (
        <path d="M0,-10 Q3.6,-3.6 8.4,0 Q3.6,3.6 0,10 Q-3.6,3.6 -8.4,0 Q-3.6,-3.6 0,-10 Z" />
      )}
      {suit === 'clubs' && (
        <path d="M0,-9 A3.8,3.8 0 1,0 0,-1.4 A3.8,3.8 0 1,0 0,-9 Z M-4.2,-2.2 A3.8,3.8 0 1,0 -4.2,5.4 A3.8,3.8 0 1,0 -4.2,-2.2 Z M4.2,-2.2 A3.8,3.8 0 1,0 4.2,5.4 A3.8,3.8 0 1,0 4.2,-2.2 Z M-1.3,2.2 Q-1.8,7.2 -3.8,9.6 H3.8 Q1.8,7.2 1.3,2.2 Z" />
      )}
    </g>
  );
}

/**
 * Renders one upper half of a classic double-headed court portrait inside viewBox [0..140, 0..100],
 * designed to be mirrored below y=100 for traditional playing-card symmetry.
 */
function CourtBustHalf({
  rank,
  suit,
  p,
}: {
  rank: Rank;
  suit: Suit;
  p: CourtPalette;
}) {
  if (rank === 11) {
    // JACK: Cavalier Knight with Plumed Velvet Beret & Upright Halberd
    return (
      <g>
        {/* Background heraldic diamond halo */}
        <polygon points="70,12 108,56 70,98 32,56" fill={p.goldLight} opacity="0.28" />

        {/* Upright Steel Halberd on left */}
        <g>
          <rect x="24" y="18" width="3.5" height="82" fill={p.hair} stroke={p.ink} strokeWidth="1.3" />
          {/* Spear tip */}
          <path d="M25.7,6 L30.5,20 L21,20 Z" fill="#D8DFE8" stroke={p.ink} strokeWidth="1.4" />
          {/* Curved halberd axe blade */}
          <path
            d="M27.5,21 Q41,20 43,32 Q36,36 27.5,33 Z"
            fill="#C7D1DD"
            stroke={p.ink}
            strokeWidth="1.4"
          />
          <circle cx="25.7" cy="21" r="2.2" fill={p.gold} stroke={p.ink} strokeWidth="1" />
        </g>

        {/* Shoulder Cape & Quartered Doublet */}
        <path
          d="M27,99 Q30,72 52,65 L88,65 Q110,72 113,99 Z"
          fill={p.primary}
          stroke={p.ink}
          strokeWidth="1.8"
        />
        {/* Tunic central sash & quartering */}
        <path d="M54,67 L70,99 L42,99 L42,74 Z" fill={p.secondary} stroke={p.ink} strokeWidth="1.2" />
        <path d="M70,66 L70,99" stroke={p.gold} strokeWidth="2.4" />
        <circle cx="70" cy="76" r="2" fill={p.goldLight} stroke={p.ink} strokeWidth="0.9" />
        <circle cx="70" cy="87" r="2" fill={p.goldLight} stroke={p.ink} strokeWidth="0.9" />

        {/* Lace Tudor Collar */}
        <path
          d="M54,65 L62,73 L70,68 L78,73 L86,65 Z"
          fill={p.cream}
          stroke={p.ink}
          strokeWidth="1.3"
        />

        {/* Neck */}
        <rect x="63" y="55" width="14" height="12" rx="3" fill={p.skinShadow} stroke={p.ink} strokeWidth="1.3" />

        {/* Pageboy Hair */}
        <path
          d="M51,38 Q46,54 51,64 L59,62 L58,42 Z"
          fill={p.hair}
          stroke={p.ink}
          strokeWidth="1.4"
        />
        <path
          d="M89,38 Q94,54 89,64 L81,62 L82,42 Z"
          fill={p.hair}
          stroke={p.ink}
          strokeWidth="1.4"
        />

        {/* Head / Youthful Aristocratic Face */}
        <path
          d="M55,34 C55,22 85,22 85,34 C85,49 78,59 70,60 C62,59 55,49 55,34 Z"
          fill={p.skin}
          stroke={p.ink}
          strokeWidth="1.7"
        />
        {/* Subtle cheek blush & jaw shading */}
        <ellipse cx="62" cy="48" rx="3.5" ry="2" fill={p.secondary} opacity="0.22" />
        <ellipse cx="78" cy="48" rx="3.5" ry="2" fill={p.secondary} opacity="0.22" />

        {/* Facial Features */}
        <path d="M60,39 Q63.5,37 66.5,39" fill="none" stroke={p.ink} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M73.5,39 Q76.5,37 80,39" fill="none" stroke={p.ink} strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="63.5" cy="42" r="1.45" fill={p.ink} />
        <circle cx="76.5" cy="42" r="1.45" fill={p.ink} />
        <path d="M70,41 L69,48 L72,49" fill="none" stroke={p.ink} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M66.5,53.5 Q70,55.5 73.5,53.5" fill="none" stroke={p.ink} strokeWidth="1.3" strokeLinecap="round" />

        {/* Plumed Feather sweeping from Beret */}
        <path
          d="M84,25 Q106,10 112,24 Q98,28 84,30 Z"
          fill={p.secondary}
          stroke={p.ink}
          strokeWidth="1.3"
        />
        <path d="M85,27 Q100,18 108,22" fill="none" stroke={p.goldLight} strokeWidth="1.2" />

        {/* Slanted Tudor Velvet Beret */}
        <path
          d="M48,34 C46,19 64,13 84,18 C95,21 94,32 86,34 Z"
          fill={p.primary}
          stroke={p.ink}
          strokeWidth="1.7"
        />
        <path
          d="M52,33 L87,33"
          stroke={p.gold}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        {/* Suit medallion pin on beret */}
        <SuitEmblem suit={suit} x={68} y={24} scale={0.48} fill={p.goldLight} />

        {/* Front gloved hand gripping halberd */}
        <circle cx="28" cy="79" r="5" fill={p.skin} stroke={p.ink} strokeWidth="1.4" />
      </g>
    );
  }

  if (rank === 12) {
    // QUEEN: Royal Lady with Jeweled Tiara, Braided Hair & Blooming Rose
    return (
      <g>
        {/* Warm arch backdrop */}
        <path d="M40,98 L40,50 A30,30 0 0,1 100,50 L100,98 Z" fill={p.goldLight} opacity="0.24" />

        {/* Royal Mantle & Gown */}
        <path
          d="M27,99 Q31,71 53,66 L87,66 Q109,71 113,99 Z"
          fill={p.primary}
          stroke={p.ink}
          strokeWidth="1.8"
        />
        {/* Embroidered gold bodice panel */}
        <path
          d="M55,67 L85,67 L79,99 L61,99 Z"
          fill={p.secondary}
          stroke={p.gold}
          strokeWidth="1.6"
        />
        <path
          d="M62,73 L70,84 L78,73"
          fill="none"
          stroke={p.goldLight}
          strokeWidth="1.8"
        />
        <circle cx="70" cy="86" r="3.2" fill={p.gold} stroke={p.ink} strokeWidth="1.1" />

        {/* Scalloped White Lace Ruff & Pearl Veil */}
        <path
          d="M47,54 Q43,66 54,70 L70,74 L86,70 Q97,66 93,54"
          fill={p.cream}
          stroke={p.ink}
          strokeWidth="1.4"
        />

        {/* Flowing Braided Hair */}
        <path
          d="M50,35 C43,45 45,62 52,69 L58,64 C54,55 54,42 56,36 Z"
          fill={p.hair}
          stroke={p.ink}
          strokeWidth="1.4"
        />
        <path
          d="M90,35 C97,45 95,62 88,69 L82,64 C86,55 86,42 84,36 Z"
          fill={p.hair}
          stroke={p.ink}
          strokeWidth="1.4"
        />

        {/* Neck */}
        <rect x="64" y="55" width="12" height="12" rx="3" fill={p.skinShadow} stroke={p.ink} strokeWidth="1.3" />

        {/* Face */}
        <path
          d="M56,35 C56,23 84,23 84,35 C84,49 77,58 70,59 C63,58 56,49 56,35 Z"
          fill={p.skin}
          stroke={p.ink}
          strokeWidth="1.6"
        />
        {/* Soft hairline */}
        <path d="M56,34 Q63,28 70,32 Q77,28 84,34" fill="none" stroke={p.hair} strokeWidth="2.4" />

        {/* Graceful Features */}
        <path d="M60.5,38.5 Q63.5,36.8 66.5,38.5" fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M73.5,38.5 Q76.5,36.8 79.5,38.5" fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="63.5" cy="41.5" r="1.4" fill={p.ink} />
        <circle cx="76.5" cy="41.5" r="1.4" fill={p.ink} />
        <ellipse cx="61" cy="47" rx="3.2" ry="1.8" fill="#DF6B6B" opacity="0.28" />
        <ellipse cx="79" cy="47" rx="3.2" ry="1.8" fill="#DF6B6B" opacity="0.28" />
        <path d="M70,41 L69.3,47 L71.2,48" fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M66.8,52.5 Q70,54.8 73.2,52.5" fill="none" stroke="#B43B44" strokeWidth="1.5" strokeLinecap="round" />

        {/* Jeweled Queen Diadem / Tiara */}
        <path
          d="M52,30 Q50,18 59,14 Q64,22 70,9 Q76,22 81,14 Q90,18 88,30 Z"
          fill={p.gold}
          stroke={p.ink}
          strokeWidth="1.5"
        />
        <rect x="52" y="27" width="36" height="4.5" rx="1.5" fill={p.goldLight} stroke={p.ink} strokeWidth="1.2" />
        <circle cx="70" cy="8.5" r="2.6" fill={p.cream} stroke={p.ink} strokeWidth="1.1" />
        <circle cx="58.5" cy="13.5" r="2.1" fill={p.cream} stroke={p.ink} strokeWidth="1" />
        <circle cx="81.5" cy="13.5" r="2.1" fill={p.cream} stroke={p.ink} strokeWidth="1" />
        <circle cx="70" cy="23" r="2.2" fill={p.primary} />

        {/* Blooming Rose held gracefully on the right */}
        <g transform="translate(107, 63)">
          <path d="M0,12 L-4,35" stroke="#1E6846" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M-2,24 Q-10,20 -8,14 Q-1,16 -2,24 Z" fill="#2A7C55" stroke={p.ink} strokeWidth="1" />
          <circle cx="0" cy="7" r="7.5" fill="#C92434" stroke={p.ink} strokeWidth="1.3" />
          <path d="M-4,6 Q0,1 4,6 Q0,11 -4,6 Z" fill="#F05A66" />
          <circle cx="-1" cy="7" r="2" fill="#8C121D" />
        </g>
        <circle cx="103" cy="83" r="4.6" fill={p.skin} stroke={p.ink} strokeWidth="1.3" />
      </g>
    );
  }

  // KING: Sovereign Monarch with 5-Arch Crown, Royal Beard & Broadsword
  return (
    <g>
      {/* Royal arch aura */}
      <circle cx="70" cy="56" r="36" fill={p.goldLight} opacity="0.22" />

      {/* Upraised Steel Broadsword on right */}
      <g>
        <path
          d="M111,10 L115,20 L115,69 L107,69 L107,20 Z"
          fill="#DCE2EA"
          stroke={p.ink}
          strokeWidth="1.4"
        />
        <line x1="111" y1="16" x2="111" y2="66" stroke="#8C99A8" strokeWidth="1.2" />
        {/* Gold crossguard */}
        <rect x="100" y="68" width="22" height="4.5" rx="2" fill={p.gold} stroke={p.ink} strokeWidth="1.3" />
        <rect x="109" y="72.5" width="4" height="12" fill={p.primary} stroke={p.ink} strokeWidth="1.2" />
        <circle cx="111" cy="86" r="3" fill={p.gold} stroke={p.ink} strokeWidth="1.2" />
      </g>

      {/* Royal Mantle Cape */}
      <path
        d="M25,99 Q28,69 50,64 L90,64 Q112,69 115,99 Z"
        fill={p.primary}
        stroke={p.ink}
        strokeWidth="1.8"
      />
      {/* Ermine Fur Shoulder Mantle with classic ermine spots */}
      <path
        d="M36,70 Q52,63 70,66 Q88,63 104,70 L98,84 Q70,79 42,84 Z"
        fill={p.cream}
        stroke={p.ink}
        strokeWidth="1.4"
      />
      <circle cx="49" cy="74" r="1.4" fill={p.ink} />
      <circle cx="57" cy="77" r="1.4" fill={p.ink} />
      <circle cx="83" cy="77" r="1.4" fill={p.ink} />
      <circle cx="91" cy="74" r="1.4" fill={p.ink} />

      {/* Gold Sovereign Collar Chain */}
      <path d="M50,82 Q70,94 90,82" fill="none" stroke={p.gold} strokeWidth="3.2" />
      <circle cx="70" cy="89" r="3.8" fill={p.secondary} stroke={p.gold} strokeWidth="1.5" />

      {/* King's Locks behind jaw */}
      <path d="M49,38 Q44,50 49,61 L56,58 L55,39 Z" fill={p.hair} stroke={p.ink} strokeWidth="1.3" />
      <path d="M91,38 Q96,50 91,61 L84,58 L85,39 Z" fill={p.hair} stroke={p.ink} strokeWidth="1.3" />

      {/* Head */}
      <path
        d="M54,34 C54,23 86,23 86,34 C86,49 79,59 70,61 C61,59 54,49 54,34 Z"
        fill={p.skin}
        stroke={p.ink}
        strokeWidth="1.6"
      />

      {/* Sculpted Royal Beard & Mustache */}
      <path
        d="M55,46 C55,58 62,65 70,66 C78,65 85,58 85,46 Q78,52 70,50 Q62,52 55,46 Z"
        fill={p.hair}
        stroke={p.ink}
        strokeWidth="1.5"
      />
      <path
        d="M61,50 Q66,47.5 70,50.5 Q74,47.5 79,50"
        fill="none"
        stroke={p.ink}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Mouth visible in beard */}
      <path d="M67,54 Q70,55.5 73,54" fill="none" stroke={p.skin} strokeWidth="1.3" strokeLinecap="round" />

      {/* Regal Brows & Eyes */}
      <path d="M59,38 Q63,36 67,38.2" fill="none" stroke={p.ink} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M73,38.2 Q77,36 81,38" fill="none" stroke={p.ink} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="63" cy="41" r="1.5" fill={p.ink} />
      <circle cx="77" cy="41" r="1.5" fill={p.ink} />
      <path d="M70,40 L69,46.5 L71.5,47.5" fill="none" stroke={p.ink} strokeWidth="1.2" strokeLinecap="round" />

      {/* Grand 5-Arch Sovereign Crown */}
      <path
        d="M50,31 L47,15 L59,23 L70,10 L81,23 L93,15 L90,31 Z"
        fill={p.gold}
        stroke={p.ink}
        strokeWidth="1.6"
      />
      {/* Velvet Crown Cap inside arches */}
      <path d="M54,24 Q70,15 86,24" fill="none" stroke={p.secondary} strokeWidth="2.6" />
      {/* Crown Cross Orb */}
      <line x1="70" y1="4" x2="70" y2="10" stroke={p.ink} strokeWidth="1.8" />
      <line x1="67" y1="6.5" x2="73" y2="6.5" stroke={p.ink} strokeWidth="1.8" />
      {/* Jeweled Brow Band */}
      <rect x="50" y="28" width="40" height="5.5" rx="1.5" fill={p.goldLight} stroke={p.ink} strokeWidth="1.3" />
      <circle cx="60" cy="30.8" r="1.6" fill={p.primary} />
      <circle cx="70" cy="30.8" r="1.9" fill={p.secondary} />
      <circle cx="80" cy="30.8" r="1.6" fill={p.primary} />

      {/* Left hand holding orb/hilt edge */}
      <circle cx="109" cy="79" r="4.8" fill={p.skin} stroke={p.ink} strokeWidth="1.4" />
    </g>
  );
}

/**
 * Full-figure / Theatrical Bust illustration for Little Joker (monochrome ink/silver)
 * and Big Joker (full polychrome crimson/emerald/gold).
 */
function JokerIllustration({ kind }: { kind: JokerKind }) {
  const isBig = kind === 'big';

  const ink = isBig ? '#1E1418' : '#181C22';
  const paper = '#FBF8F1';
  const motleyA = isBig ? '#C81F2C' : '#2C323B';
  const motleyB = isBig ? '#1B6548' : '#7A838F';
  const motleyC = isBig ? '#1E4380' : '#4D5560';
  const gold = isBig ? '#DDA83F' : '#B5BCC4';
  const goldLight = isBig ? '#F8E092' : '#E3E7EC';
  const skin = isBig ? '#F6D9BA' : '#EDEBE6';
  const blush = isBig ? '#DF5A5A' : '#8A929B';

  return (
    <svg viewBox="0 0 140 200" className="h-full w-full" aria-hidden="true">
      {/* Ornate inner Joker frame */}
      <rect
        x="3"
        y="3"
        width="134"
        height="194"
        rx="5"
        fill={isBig ? '#FAF4E8' : '#F4F4F2'}
        stroke={isBig ? '#D4A853' : '#535B66'}
        strokeWidth="2.2"
      />
      <rect
        x="7.5"
        y="7.5"
        width="125"
        height="185"
        rx="3"
        fill="none"
        stroke={isBig ? 'rgba(200, 31, 44, 0.25)' : 'rgba(24, 28, 34, 0.2)'}
        strokeWidth="1"
      />

      {/* Radiating starburst behind Big Joker / subtle engraving halo behind Little Joker */}
      <circle
        cx="70"
        cy="92"
        r="48"
        fill={isBig ? 'rgba(221, 168, 63, 0.16)' : 'rgba(90, 98, 108, 0.1)'}
      />
      {isBig && (
        <g stroke="rgba(221, 168, 63, 0.38)" strokeWidth="1.2">
          <line x1="70" y1="22" x2="70" y2="34" />
          <line x1="25" y1="54" x2="34" y2="62" />
          <line x1="115" y1="54" x2="106" y2="62" />
          <line x1="18" y1="95" x2="29" y2="95" />
          <line x1="122" y1="95" x2="111" y2="95" />
        </g>
      )}

      {/* Corner stars / diamonds */}
      <path d="M20,22 L22,26 L26,28 L22,30 L20,34 L18,30 L14,28 L18,26 Z" fill={gold} />
      <path d="M120,22 L122,26 L126,28 L122,30 L120,34 L118,30 L114,28 L118,26 Z" fill={gold} />
      <path d="M20,166 L22,170 L26,172 L22,174 L20,178 L18,174 L14,172 L18,170 Z" fill={gold} />
      <path d="M120,166 L122,170 L126,172 L122,174 L120,178 L118,174 L114,172 L118,170 Z" fill={gold} />

      {/* Jester's Marotte Scepter held on the right */}
      <g transform="translate(106, 74) rotate(12)">
        <rect x="-2" y="18" width="4" height="68" rx="1.5" fill={gold} stroke={ink} strokeWidth="1.3" />
        <circle cx="0" cy="14" r="9.5" fill={motleyA} stroke={ink} strokeWidth="1.3" />
        <circle cx="0" cy="14" r="5" fill={skin} stroke={ink} strokeWidth="1" />
        <path d="M-8,8 L-12,0 L-3,6 L0,-2 L3,6 L12,0 L8,8 Z" fill={goldLight} stroke={ink} strokeWidth="1" />
      </g>

      {/* Motley Tunic & Harlequin Checkered Body */}
      <path
        d="M28,172 C29,134 45,114 70,114 C95,114 111,134 112,172 Z"
        fill={motleyA}
        stroke={ink}
        strokeWidth="1.8"
      />
      <path
        d="M70,114 C95,114 111,134 112,172 L70,172 Z"
        fill={motleyB}
        stroke={ink}
        strokeWidth="1.4"
      />
      {/* Diamond tunic pattern */}
      <polygon points="52,140 60,150 52,160 44,150" fill={goldLight} stroke={ink} strokeWidth="1" />
      <polygon points="88,140 96,150 88,160 80,150" fill={motleyC} stroke={ink} strokeWidth="1" />
      <polygon points="70,154 78,164 70,172 62,164" fill={gold} stroke={ink} strokeWidth="1" />

      {/* Zigzag Harlequin Ruff Collar with Golden Bells */}
      <path
        d="M36,118 L46,133 L56,120 L70,136 L84,120 L94,133 L104,118 L92,107 L48,107 Z"
        fill={paper}
        stroke={ink}
        strokeWidth="1.6"
      />
      <circle cx="46" cy="135" r="3" fill={gold} stroke={ink} strokeWidth="1" />
      <circle cx="70" cy="138" r="3.4" fill={gold} stroke={ink} strokeWidth="1" />
      <circle cx="94" cy="135" r="3" fill={gold} stroke={ink} strokeWidth="1" />

      {/* Neck */}
      <rect x="63" y="96" width="14" height="14" rx="3" fill={skin} stroke={ink} strokeWidth="1.4" />

      {/* Jester Head & Chin */}
      <path
        d="M52,72 C52,55 88,55 88,72 C88,91 79,103 70,104 C61,103 52,91 52,72 Z"
        fill={skin}
        stroke={ink}
        strokeWidth="1.8"
      />

      {/* Mischievous Theatrical Expression */}
      <path d="M58,72 Q62.5,68 66.5,72" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M73.5,72 Q77.5,68 82,72" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="62.5" cy="76" r="2" fill={ink} />
      <circle cx="77.5" cy="76" r="2" fill={ink} />
      {/* Theatrical cheek paint & nose */}
      <circle cx="58" cy="83" r="3.5" fill={blush} opacity="0.45" />
      <circle cx="82" cy="83" r="3.5" fill={blush} opacity="0.45" />
      <circle cx="70" cy="81" r="2.6" fill={isBig ? '#C81F2C' : '#3C434D'} stroke={ink} strokeWidth="1" />
      {/* Wide jovial smile */}
      <path
        d="M59,88 Q70,98 81,88 Q70,93 59,88 Z"
        fill={isBig ? '#C81F2C' : '#2C323B'}
        stroke={ink}
        strokeWidth="1.3"
      />

      {/* Ornate Multi-Horned Jester Cap with Dangling Bells */}
      {/* Left Horn */}
      <path
        d="M54,64 C44,50 28,44 20,56 C27,62 38,61 48,68 Z"
        fill={motleyA}
        stroke={ink}
        strokeWidth="1.6"
      />
      <circle cx="19" cy="57" r="4.2" fill={gold} stroke={ink} strokeWidth="1.3" />

      {/* Right Horn */}
      <path
        d="M86,64 C96,50 112,44 120,56 C113,62 102,61 92,68 Z"
        fill={motleyB}
        stroke={ink}
        strokeWidth="1.6"
      />
      <circle cx="121" cy="57" r="4.2" fill={gold} stroke={ink} strokeWidth="1.3" />

      {/* Center Plume / Extra Royal Horns for Big Joker */}
      {isBig ? (
        <>
          <path
            d="M62,56 C52,36 40,26 35,34 C42,41 48,47 56,59 Z"
            fill={motleyC}
            stroke={ink}
            strokeWidth="1.5"
          />
          <circle cx="34" cy="34" r="3.8" fill={goldLight} stroke={ink} strokeWidth="1.2" />
          <path
            d="M78,56 C88,36 100,26 105,34 C98,41 92,47 84,59 Z"
            fill={gold}
            stroke={ink}
            strokeWidth="1.5"
          />
          <circle cx="106" cy="34" r="3.8" fill={goldLight} stroke={ink} strokeWidth="1.2" />
          <path
            d="M64,56 Q70,28 70,22 Q70,28 76,56 Z"
            fill={motleyA}
            stroke={ink}
            strokeWidth="1.5"
          />
          <circle cx="70" cy="21" r="4.5" fill={gold} stroke={ink} strokeWidth="1.3" />
        </>
      ) : (
        <>
          <path
            d="M62,58 C65,34 73,26 78,34 C74,42 74,48 76,58 Z"
            fill={motleyC}
            stroke={ink}
            strokeWidth="1.5"
          />
          <circle cx="79" cy="34" r="4.2" fill={gold} stroke={ink} strokeWidth="1.3" />
        </>
      )}

      {/* Cap Crown Band */}
      <path
        d="M50,65 Q70,56 90,65 L88,71 Q70,63 52,71 Z"
        fill={gold}
        stroke={ink}
        strokeWidth="1.4"
      />

      {/* Right hand gripping marotte */}
      <circle cx="101" cy="144" r="5" fill={skin} stroke={ink} strokeWidth="1.4" />
      {/* Left hand poised playfully */}
      <circle cx="38" cy="144" r="5" fill={skin} stroke={ink} strokeWidth="1.4" />

      {/* Bottom Banner Label */}
      <text
        x="70"
        y="186"
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        letterSpacing="1.8"
        fill={isBig ? '#B61D28' : '#2A3038'}
        fontFamily="serif"
      >
        {isBig ? 'GRAND JOKER' : 'LITTLE JOKER'}
      </text>
    </svg>
  );
}

export function CourtPortraitSvg({ rank, suit, joker, className }: CourtPortraitSvgProps) {
  const clipId = useId();
  if (joker) {
    return <JokerIllustration kind={joker} />;
  }

  const resolvedRank: Rank = rank ?? 13;
  const p = getCourtPalette(suit);

  return (
    <svg viewBox="0 0 140 200" className={className ?? 'h-full w-full'} aria-hidden="true">
      {/* Ornate double court frame */}
      <rect x="3" y="3" width="134" height="194" rx="4" fill={p.bgTint} stroke={p.gold} strokeWidth="2.2" />
      <rect
        x="7"
        y="7"
        width="126"
        height="186"
        rx="2"
        fill="none"
        stroke={p.ink}
        strokeOpacity="0.22"
        strokeWidth="1"
      />

      {/* Top & bottom inner suit pips */}
      <SuitEmblem suit={suit} x={21} y={22} scale={0.72} fill={p.primary} />
      <g transform="rotate(180 70 100)">
        <SuitEmblem suit={suit} x={21} y={22} scale={0.72} fill={p.primary} />
      </g>

      {/* Clipped Double-Headed Court Artwork */}
      <defs>
        <clipPath id={clipId}>
          <rect x="8" y="8" width="124" height="184" rx="2" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Upright upper half */}
        <CourtBustHalf rank={resolvedRank} suit={suit} p={p} />

        {/* Mirrored lower half */}
        <g transform="rotate(180 70 100)">
          <CourtBustHalf rank={resolvedRank} suit={suit} p={p} />
        </g>

        {/* Classic diagonal gold divider sash */}
        <line x1="12" y1="106" x2="128" y2="94" stroke={p.gold} strokeWidth="2.2" />
        <line x1="12" y1="106" x2="128" y2="94" stroke={p.ink} strokeOpacity="0.35" strokeWidth="0.8" />
        <circle cx="70" cy="100" r="4" fill={p.goldLight} stroke={p.ink} strokeWidth="1.2" />
      </g>
    </svg>
  );
}
