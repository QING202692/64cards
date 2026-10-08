// ====== 8 经卦 ======
const TRIGRAMS = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];

const TRIGRAM_INFO = {
  qian: { name: '乾', symbol: '☰' },
  dui:  { name: '兑', symbol: '☱' },
  li:   { name: '离', symbol: '☲' },
  zhen: { name: '震', symbol: '☳' },
  xun:  { name: '巽', symbol: '☴' },
  kan:  { name: '坎', symbol: '☵' },
  gen:  { name: '艮', symbol: '☶' },
  kun:  { name: '坤', symbol: '☷' },
};

// 三爻阴阳值：索引 0=下爻(初)，1=中爻，2=上爻；1=阳，0=阴（全项目唯一坐标）
const TRIGRAM_YAO = {
  qian:  [1, 1, 1],
  dui:   [1, 1, 0],
  li:    [1, 0, 1],
  zhen:  [1, 0, 0],
  xun:   [0, 1, 1],
  kan:   [0, 1, 0],
  gen:   [0, 0, 1],
  kun:   [0, 0, 0],
};

// 变爻位置 -> 爻数组索引（与 TRIGRAM_YAO 同一套坐标）
const CHANGING_INDEX = { lower: 0, middle: 1, upper: 2 };

// 一爻变映射：原卦 -> { lower/middle/upper -> 变后卦 }
const CHANGE_MAP = {
  qian: { lower: 'xun',  middle: 'li',  upper: 'dui'  },
  dui:  { lower: 'kan',  middle: 'zhen', upper: 'qian' },
  li:   { lower: 'gen',  middle: 'qian', upper: 'zhen' },
  zhen: { lower: 'kun',  middle: 'dui',  upper: 'li'   },
  xun:  { lower: 'qian', middle: 'gen',  upper: 'kan'  },
  kan:  { lower: 'dui',  middle: 'kun',  upper: 'xun'  },
  gen:  { lower: 'li',   middle: 'xun',  upper: 'kun'  },
  kun:  { lower: 'zhen', middle: 'kan',  upper: 'gen'  },
};

// 上卦+下卦 对应的中文名（上卦属性+下卦属性+卦名）
// 天地雷风水火山泽
const TRIGRAM_ELEMENT = {
  qian: '天', dui: '泽', li: '火', zhen: '雷',
  xun: '风', kan: '水', gen: '山', kun: '地',
};

// ====== 64 卦效果表 ======
// 格式：key = 上卦key + 下卦key
// effects: 效果数组，执行器按顺序执行
// 效果类型：damage / heal / shield / draw / stun / debuff / buff / special
const HEXAGRAMS = {
  qianqian: {
    id: 1, name: '乾为天', cost: 6,
    desc: '单体造成24伤害，自身获得8护盾；本回合你的攻击不可被反弹',
    effects: [
      { type: 'damage', target: 'single', value: 24 },
      { type: 'shield', target: 'self', value: 8 },
      { type: 'buff', target: 'self', buff: 'noReflect', duration: 1 },
    ],
  },
  kunkun: {
    id: 2, name: '坤为地', cost: 6,
    desc: '你与所有存活玩家恢复15HP，全体存活玩家获得7护盾',
    effects: [
      { type: 'heal', target: 'all', value: 15 },
      { type: 'shield', target: 'all', value: 7 },
    ],
  },
  kanzhen: {
    id: 3, name: '水雷屯', cost: 3,
    desc: '自身获得10护盾；自身HP＜40时，护盾翻倍',
    effects: [
      { type: 'shield', target: 'self', value: 10, condition: 'hpLess40Double' },
    ],
  },
  genkan: {
    id: 4, name: '山水蒙', cost: 2,
    desc: '目标本回合无法打出≥3气卡牌',
    effects: [
      { type: 'debuff', target: 'single', debuff: 'noHighCost', value: 3, duration: 1 },
    ],
  },
  kanqian: {
    id: 5, name: '水天需', cost: 3,
    desc: '自身获得12护盾，抽1张牌',
    effects: [
      { type: 'shield', target: 'self', value: 12 },
      { type: 'draw', value: 1 },
    ],
  },
  qiankan: {
    id: 6, name: '天水讼', cost: 3,
    desc: '单体12伤害；若目标本回合主动攻击过你，额外+6伤害',
    effects: [
      { type: 'damage', target: 'single', value: 12, bonus: { type: 'attackedMe', value: 6 } },
    ],
  },
  kunkan: {
    id: 7, name: '地水师', cost: 4,
    desc: '全体其他玩家7伤害，自身获得7护盾',
    effects: [
      { type: 'damage', target: 'allOthers', value: 7 },
      { type: 'shield', target: 'self', value: 7 },
    ],
  },
  kankun: {
    id: 8, name: '水地比', cost: 3,
    desc: '选一名玩家，双方各获得9护盾',
    effects: [
      { type: 'shield', target: 'singleAndSelf', value: 9 },
    ],
  },
  xunqian: {
    id: 9, name: '风天小畜', cost: 2,
    desc: '获得8护盾，抽1张牌',
    effects: [
      { type: 'shield', target: 'self', value: 8 },
      { type: 'draw', value: 1 },
    ],
  },
  qiandui: {
    id: 10, name: '天泽履', cost: 3,
    desc: '本回合第一次受到攻击，反弹8伤害给攻击者',
    effects: [
      { type: 'buff', target: 'self', buff: 'reflect', value: 8, duration: 1 },
    ],
  },
  kunqian: {
    id: 11, name: '地天泰', cost: 5,
    desc: '自选一名玩家，你与玩家各恢复12HP、获得8护盾',
    effects: [
      { type: 'heal', target: 'singleAndSelf', value: 12 },
      { type: 'shield', target: 'singleAndSelf', value: 8 },
    ],
  },
  qiankun: {
    id: 12, name: '天地否', cost: 4,
    desc: '全体其他玩家8伤害，清空其他玩家全部护盾',
    effects: [
      { type: 'damage', target: 'allOthers', value: 8 },
      { type: 'special', action: 'clearShieldAllOthers' },
    ],
  },
  qianli: {
    id: 13, name: '天火同人', cost: 4,
    desc: '你和一名玩家，各恢复10HP',
    effects: [
      { type: 'heal', target: 'singleAndSelf', value: 10 },
    ],
  },
  liqian: {
    id: 14, name: '火天大有', cost: 5,
    desc: '单体18伤害；命中后自身恢复8HP',
    effects: [
      { type: 'damage', target: 'single', value: 18 },
      { type: 'heal', target: 'self', value: 8 },
    ],
  },
  kungen: {
    id: 15, name: '地山谦', cost: 2,
    desc: '自身获得7护盾；本回合其他玩家对你造成伤害-4',
    effects: [
      { type: 'shield', target: 'self', value: 7 },
      { type: 'buff', target: 'self', buff: 'damageReduce', value: 4, duration: 1 },
    ],
  },
  zhenkun: {
    id: 16, name: '雷地豫', cost: 2,
    desc: '下回合你的回气额外+2',
    effects: [
      { type: 'buff', target: 'self', buff: 'extraQi', value: 2, duration: 2 },
    ],
  },
  duizhen: {
    id: 17, name: '泽雷随', cost: 3,
    desc: '复制目标上回合打出的≤2气卡牌效果',
    effects: [
      { type: 'special', action: 'copyLastLowCost' },
    ],
  },
  genxun: {
    id: 18, name: '山风蛊', cost: 3,
    desc: '单体12伤害；附加持续2回合debuff，每回合掉4HP',
    effects: [
      { type: 'damage', target: 'single', value: 12 },
      { type: 'debuff', target: 'single', debuff: 'poison', value: 4, duration: 2 },
    ],
  },
  kundui: {
    id: 19, name: '地泽临', cost: 4,
    desc: '全体其他玩家7伤害，自身获得6护盾',
    effects: [
      { type: 'damage', target: 'allOthers', value: 7 },
      { type: 'shield', target: 'self', value: 6 },
    ],
  },
  xunkun: {
    id: 20, name: '风地观', cost: 2,
    desc: '抽2张牌，自身获得5护盾',
    effects: [
      { type: 'draw', value: 2 },
      { type: 'shield', target: 'self', value: 5 },
    ],
  },
  lizhen: {
    id: 21, name: '火雷噬嗑', cost: 4,
    desc: '单体16伤害，清除目标全部护盾',
    effects: [
      { type: 'damage', target: 'single', value: 16 },
      { type: 'special', action: 'clearShieldSingle' },
    ],
  },
  genli: {
    id: 22, name: '山火贲', cost: 2,
    desc: '自身恢复9HP，抽1张牌',
    effects: [
      { type: 'heal', target: 'self', value: 9 },
      { type: 'draw', value: 1 },
    ],
  },
  genkun: {
    id: 23, name: '山地剥', cost: 3,
    desc: '单体15伤害；目标有护盾时，额外+7伤害',
    effects: [
      { type: 'damage', target: 'single', value: 15, bonus: { type: 'hasShield', value: 7 } },
    ],
  },
  kunzhen: {
    id: 24, name: '地雷复', cost: 4,
    desc: '立刻结束你的回合；下回合开局额外获得4气',
    effects: [
      { type: 'special', action: 'endTurn' },
      { type: 'buff', target: 'self', buff: 'extraQi', value: 4, duration: 1 },
    ],
  },
  qianzhen: {
    id: 25, name: '天雷无妄', cost: 4,
    desc: '单体17伤害；此伤害无法被反弹',
    effects: [
      { type: 'damage', target: 'single', value: 17, noReflect: true },
    ],
  },
  genqian: {
    id: 26, name: '山天大畜', cost: 4,
    desc: '立刻获得12护盾',
    effects: [
      { type: 'shield', target: 'self', value: 12 },
    ],
  },
  genzhen: {
    id: 27, name: '山雷颐', cost: 2,
    desc: '自身恢复11HP',
    effects: [
      { type: 'heal', target: 'self', value: 11 },
    ],
  },
  duixun: {
    id: 28, name: '泽风大过', cost: 4,
    desc: '单体20伤害；目标HP＜30时，额外+10伤害',
    effects: [
      { type: 'damage', target: 'single', value: 20, bonus: { type: 'hpLess30', value: 10 } },
    ],
  },
  kankan: {
    id: 29, name: '坎为水', cost: 4,
    desc: '单体14伤害；目标本回合无法打出≥4气卡牌',
    effects: [
      { type: 'damage', target: 'single', value: 14 },
      { type: 'debuff', target: 'single', debuff: 'noHighCost', value: 4, duration: 1 },
    ],
  },
  lili: {
    id: 30, name: '离为火', cost: 5,
    desc: '单体21伤害',
    effects: [
      { type: 'damage', target: 'single', value: 21 },
    ],
  },
  duigen: {
    id: 31, name: '泽山咸', cost: 3,
    desc: '单体10伤害；你恢复本次伤害一半的HP',
    effects: [
      { type: 'damage', target: 'single', value: 10, lifesteal: 0.5 },
    ],
  },
  zhenxun: {
    id: 32, name: '雷风恒', cost: 4,
    desc: '持续2回合：每回合开始恢复6HP',
    effects: [
      { type: 'buff', target: 'self', buff: 'regen', value: 6, duration: 2 },
    ],
  },
  qiangen: {
    id: 33, name: '天山遁', cost: 4,
    desc: '自身获得18护盾；本回合受到所有伤害-6',
    effects: [
      { type: 'shield', target: 'self', value: 18 },
      { type: 'buff', target: 'self', buff: 'damageReduce', value: 6, duration: 1 },
    ],
  },
  zhenqian: {
    id: 34, name: '雷天大壮', cost: 4,
    desc: '单体17伤害；自身HP＞70时伤害+5',
    effects: [
      { type: 'damage', target: 'single', value: 17, bonus: { type: 'selfHpMore70', value: 5 } },
    ],
  },
  likun: {
    id: 35, name: '火地晋', cost: 3,
    desc: '自身恢复12HP，抽1张牌',
    effects: [
      { type: 'heal', target: 'self', value: 12 },
      { type: 'draw', value: 1 },
    ],
  },
  kunli: {
    id: 36, name: '地火明夷', cost: 3,
    desc: '本回合自身受到全部伤害-10',
    effects: [
      { type: 'buff', target: 'self', buff: 'damageReduce', value: 10, duration: 1 },
    ],
  },
  xunli: {
    id: 37, name: '风火家人', cost: 4,
    desc: '选择一名玩家，恢复14HP',
    effects: [
      { type: 'heal', target: 'single', value: 14 },
    ],
  },
  lidui: {
    id: 38, name: '火泽睽', cost: 2,
    desc: '单体9伤害，抽1张牌',
    effects: [
      { type: 'damage', target: 'single', value: 9 },
      { type: 'draw', value: 1 },
    ],
  },
  kangen: {
    id: 39, name: '水山蹇', cost: 3,
    desc: '单体11伤害；目标下回合抽牌数量-1',
    effects: [
      { type: 'damage', target: 'single', value: 11 },
      { type: 'debuff', target: 'single', debuff: 'drawReduce', value: 1, duration: 1 },
    ],
  },
  zhenkan: {
    id: 40, name: '雷水解', cost: 3,
    desc: '在反应阶段打出，免疫一次伤害',
    isReaction: true,
    effects: [
      { type: 'special', action: 'immune' },
    ],
  },
  gendui: {
    id: 41, name: '山泽损', cost: 3,
    desc: '单体11伤害，自身恢复6HP',
    effects: [
      { type: 'damage', target: 'single', value: 11 },
      { type: 'heal', target: 'self', value: 6 },
    ],
  },
  xunzhen: {
    id: 42, name: '风雷益', cost: 3,
    desc: '你与一名玩家：各恢复8HP，获得6护盾',
    effects: [
      { type: 'heal', target: 'singleAndSelf', value: 8 },
      { type: 'shield', target: 'singleAndSelf', value: 6 },
    ],
  },
  duiqian: {
    id: 43, name: '泽天夬', cost: 5,
    desc: '单体19伤害；目标HP≤20时，额外+8伤害',
    effects: [
      { type: 'damage', target: 'single', value: 19, bonus: { type: 'hpLessEq20', value: 8 } },
    ],
  },
  qianxun: {
    id: 44, name: '天风姤', cost: 3,
    desc: '单体12伤害；目标下回合回气-1',
    effects: [
      { type: 'damage', target: 'single', value: 12 },
      { type: 'debuff', target: 'single', debuff: 'qiReduce', value: 1, duration: 1 },
    ],
  },
  duikun: {
    id: 45, name: '泽地萃', cost: 4,
    desc: '全体其他玩家6伤害；每存活一名玩家，伤害额外+3',
    effects: [
      { type: 'damage', target: 'allOthers', value: 6, bonus: { type: 'perAlive', value: 3 } },
    ],
  },
  kunxun: {
    id: 46, name: '地风升', cost: 3,
    desc: '抽2张牌',
    effects: [
      { type: 'draw', value: 2 },
    ],
  },
  duikan: {
    id: 47, name: '泽水困', cost: 3,
    desc: '目标下回合抽牌数量-2',
    effects: [
      { type: 'debuff', target: 'single', debuff: 'drawReduce', value: 2, duration: 1 },
    ],
  },
  kanxun: {
    id: 48, name: '水风井', cost: 2,
    desc: '全部玩家恢复5HP',
    effects: [
      { type: 'heal', target: 'all', value: 5 },
    ],
  },
  duili: {
    id: 49, name: '泽火革', cost: 4,
    desc: '自己回合：单体18伤害；反应阶段：免疫本次伤害的一半',
    effects: [
      { type: 'damage', target: 'single', value: 18 },
    ],
    reactionEffects: [
      { type: 'special', action: 'immuneHalf' },
    ],
  },
  lixun: {
    id: 50, name: '火风鼎', cost: 4,
    desc: '下回合你打出的所有卡牌伤害+5',
    effects: [
      { type: 'buff', target: 'self', buff: 'damageBonus', value: 5, duration: 1 },
    ],
  },
  zhenzhen: {
    id: 51, name: '震为雷', cost: 5,
    desc: '眩晕一名玩家，造成3点伤害；该玩家下回合跳过摸牌、行动、反应阶段',
    effects: [
      { type: 'damage', target: 'single', value: 3 },
      { type: 'debuff', target: 'single', debuff: 'stun', duration: 1 },
    ],
  },
  gengen: {
    id: 52, name: '艮为山', cost: 5,
    desc: '自身获得24护盾',
    effects: [
      { type: 'shield', target: 'self', value: 24 },
    ],
  },
  xungen: {
    id: 53, name: '风山渐', cost: 3,
    desc: '选择一名玩家恢复10HP',
    effects: [
      { type: 'heal', target: 'single', value: 10 },
    ],
  },
  zhendui: {
    id: 54, name: '雷泽归妹', cost: 3,
    desc: '单体14伤害；若本回合你已经出过牌，此伤害减半',
    effects: [
      { type: 'damage', target: 'single', value: 14, condition: 'ifAlreadyPlayedHalf' },
    ],
  },
  zhenli: {
    id: 55, name: '雷火丰', cost: 5,
    desc: '全体其他玩家10伤害',
    effects: [
      { type: 'damage', target: 'allOthers', value: 10 },
    ],
  },
  ligen: {
    id: 56, name: '火山旅', cost: 3,
    desc: '单体13伤害，抽1张牌',
    effects: [
      { type: 'damage', target: 'single', value: 13 },
      { type: 'draw', value: 1 },
    ],
  },
  xunxun: {
    id: 57, name: '巽为风', cost: 3,
    desc: '抽4张牌',
    effects: [
      { type: 'draw', value: 4 },
    ],
  },
  duidui: {
    id: 58, name: '兑为泽', cost: 3,
    desc: '使得一名玩家下一回合开局无法摸牌',
    effects: [
      { type: 'debuff', target: 'single', debuff: 'noDraw', duration: 1 },
    ],
  },
  xunkan: {
    id: 59, name: '风水涣', cost: 3,
    desc: '清除一名玩家身上所有护盾',
    effects: [
      { type: 'special', action: 'clearShieldSingle' },
    ],
  },
  kandui: {
    id: 60, name: '水泽节', cost: 2,
    desc: '本回合所有玩家出牌消耗气+1（含自己）',
    effects: [
      { type: 'debuff', target: 'all', debuff: 'costIncrease', value: 1, duration: 1 },
    ],
  },
  xundui: {
    id: 61, name: '风泽中孚', cost: 4,
    desc: '选一名玩家，双方各获得12护盾',
    effects: [
      { type: 'shield', target: 'singleAndSelf', value: 12 },
    ],
  },
  zhengen: {
    id: 62, name: '雷山小过', cost: 2,
    desc: '单体8伤害；本回合你可以多打出1张2费以内卡牌',
    effects: [
      { type: 'damage', target: 'single', value: 8 },
      { type: 'buff', target: 'self', buff: 'extraPlay', value: 2, duration: 1 },
    ],
  },
  kanli: {
    id: 63, name: '水火既济', cost: 5,
    desc: '单体16伤害，自身恢复10HP',
    effects: [
      { type: 'damage', target: 'single', value: 16 },
      { type: 'heal', target: 'self', value: 10 },
    ],
  },
  likan: {
    id: 64, name: '火水未济', cost: 4,
    desc: '单体15伤害；自身HP＜50时，伤害+6',
    effects: [
      { type: 'damage', target: 'single', value: 15, bonus: { type: 'selfHpLess50', value: 6 } },
    ],
  },
};

// 根据上下卦key生成64卦对象
function getHexagram(upperKey, lowerKey) {
  return HEXAGRAMS[upperKey + lowerKey] || null;
}

// 获取卦的中文名
function getHexagramName(upperKey, lowerKey) {
  const h = getHexagram(upperKey, lowerKey);
  return h ? h.name : `${TRIGRAM_ELEMENT[upperKey]}${TRIGRAM_ELEMENT[lowerKey]}`;
}

// 生成变爻后的卦key
function getChangedKey(card) {
  if (!card.changing) return card.trigram;
  return CHANGE_MAP[card.trigram][card.changing];
}

// ====== 卦辞（按 64 卦 id 索引，唯一数据源）======
const HEXAGRAM_QUOTES = {
  1: '乾：元亨利贞，天行健，君子自强不息',
  2: '坤：元亨，利牝马之贞，厚德载物',
  3: '屯：刚柔始交而难生，初创守险',
  4: '蒙：匪我求童蒙，童蒙求我，蒙昧闭塞',
  5: '需：有孚，光亨，贞吉，等待时机',
  6: '讼：有孚窒，惕中吉，争讼博弈',
  7: '师：贞，丈人吉，兴师聚众',
  8: '比：吉，原筮，永贞无咎，亲辅相依',
  9: '小畜：亨，密云不雨，小幅蓄势',
  10: '履：履虎尾，不咥人，谨慎而行',
  11: '泰：小往大来，天地交泰，阴阳相通',
  12: '否：否之匪人，天地不交，闭塞阻隔',
  13: '同人：同人于野，同心相助',
  14: '大有：元亨，大获所有，攻而有得',
  15: '谦：亨，君子有终，谦抑减损灾祸',
  16: '豫：利建侯行师，安乐蓄力',
  17: '随：元亨，利贞，随顺效仿',
  18: '蛊：元亨，振民育德，积弊生患',
  19: '临：元亨，利贞，居高临下监视',
  20: '观：盥而不荐，静观局势',
  21: '噬嗑：亨，利用狱，咬合破除阻碍',
  22: '贲：亨，小利有攸往，文饰润养',
  23: '剥：剥床以足，阴侵消阳，逐层瓦解',
  24: '复：亨，七日来复，一阳复生',
  25: '无妄：元亨，利贞，无妄之灾直击',
  26: '大畜：利贞，蓄养积蓄，厚积',
  27: '颐：贞吉，自求口实，颐养自身',
  28: '大过：栋桡，大难摧折弱者',
  29: '习坎：有孚维心，重重险陷困敌',
  30: '离：利贞，亨，附丽光明，如火灼烧',
  31: '咸：亨，利贞，取女吉，阴阳感应，汲取力量',
  32: '恒：亨，无咎，利贞，恒久滋养',
  33: '遁：亨，小利贞，适时退避自保',
  34: '大壮：利贞，阳气盛壮，全盛强攻',
  35: '晋：康侯用锡马蕃庶，光明上进',
  36: '明夷：利艰贞，光明受损，韬光避害',
  37: '家人：利女贞，护佑亲友',
  38: '睽：小事吉，乖离对立，试探袭扰',
  39: '蹇：利西南，不利东北，险阻困人',
  40: '解：利西南，散解困厄',
  41: '损：损下益上，减敌益己',
  42: '益：利有攸往，损上益下，彼此增益',
  43: '夬：扬于王庭，决断除患，剪除残敌',
  44: '姤：女壮，勿用取女，阴来相遇，暗中牵制',
  45: '萃：亨，汇聚力量，人多势强',
  46: '升：元亨，顺势上升，得机缘',
  47: '困：亨，贞，受困，断绝机缘',
  48: '井：改邑不改井，井养万物',
  49: '革：己日乃孚，除旧革新，破除优势',
  50: '鼎：元吉，元亨，定鼎蓄力，增威',
  51: '震：亨，震来虩虩，惊雷爆发',
  52: '艮：艮其背，时止则止，如山固守',
  53: '渐：女归吉，渐进帮扶',
  54: '归妹：征凶，无攸利，不宜连续强攻',
  55: '丰：亨，王假之，盛大波及众人',
  56: '旅：小亨，羁旅袭扰，伺机寻找机会',
  57: '巽：小亨，利有攸往，如风渗入，轻袭探察',
  58: '兑：亨，利贞，两泽相悦，试探交锋',
  59: '涣：亨，王假有庙，涣散敌方优势',
  60: '节：亨，苦节不可贞，节制万物',
  61: '中孚：豚鱼吉，诚信同心，互相庇护',
  62: '小过：亨，利贞，小有逾越，多出小动作',
  63: '既济：亨小，利贞，功成安定，攻守平衡',
  64: '未济：亨，事未成，危境迸发力量',
};

// 统一访问卦辞，缺失时兜底，避免 UI 直接读原始映射
function getHexQuote(hexId) {
  return HEXAGRAM_QUOTES[hexId] || '';
}

// 根据两张手牌计算变卦（若有），返回变卦对象或 null
function getChangedHexagram(upperCard, lowerCard) {
  if (!upperCard.changing && !lowerCard.changing) return null;
  const cu = upperCard.changing ? getChangedKey(upperCard) : upperCard.trigram;
  const cl = lowerCard.changing ? getChangedKey(lowerCard) : lowerCard.trigram;
  return getHexagram(cu, cl);
}
