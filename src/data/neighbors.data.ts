/**
 * NPC 邻居人设：8 位性格各异的岛民，每人一座会随时间演化的小岛。
 * 对话文案全部原创。
 */
import type { NeighborPersona, AvatarConfig } from '../core/types';

function av(partial: Partial<AvatarConfig>): AvatarConfig {
  return {
    skin: 'cl_skin_fair',
    hair: 'cl_hair_short_brown',
    face: 'cl_face_smile',
    top: 'cl_top_tee_blue',
    bottom: 'cl_bottom_shorts',
    hat: null,
    accessory: null,
    ...partial,
  };
}

export const NEIGHBORS: NeighborPersona[] = [
  {
    id: 'npc_haitang',
    name: { zh: '海棠婶', en: 'Auntie Haitang' },
    avatar: av({ skin: 'cl_skin_tan', hair: 'cl_hair_bun_teal', top: 'cl_top_tang', hat: 'cl_hat_straw' }),
    islandSeed: 101,
    greetings: [
      { zh: '来啦？灶上刚蒸了芋头糕，拿两块去。', en: 'You came! Fresh taro cake on the stove—take some.' },
      { zh: '我这把老骨头就爱侍弄这几块地。', en: 'These old bones just love tending the fields.' },
    ],
    thanks: [
      { zh: '好孩子，婶记着你的情。', en: 'Good child, Auntie remembers your kindness.' },
      { zh: '哎哟，比我家那口子勤快多了！', en: 'My, harder-working than my own family!' },
    ],
    angry: [
      { zh: '哪个皮猴子在我菜地里撒野！', en: 'Which little monkey is messing up my garden!' },
    ],
    favoriteCrop: 'crop_taro',
  },
  {
    id: 'npc_maodan',
    name: { zh: '毛蛋', en: 'Maodan' },
    avatar: av({ hair: 'cl_hair_spiky_blue', face: 'cl_face_happy', top: 'cl_top_tee_coral' }),
    islandSeed: 202,
    greetings: [
      { zh: '嘿嘿，你猜我昨天在谁家岛上放了只青蛙？', en: 'Heh, guess whose island I put a frog on yesterday?' },
      { zh: '无聊死了，来比赛钓鱼吗？', en: 'So bored. Fishing contest?' },
    ],
    thanks: [
      { zh: '行啊你，够意思！', en: 'Not bad, you’re alright!' },
    ],
    angry: [
      { zh: '喂！捣蛋是我的专利！', en: 'Hey! Pranking is MY specialty!' },
    ],
    favoriteCrop: 'crop_corn',
  },
  {
    id: 'npc_xiaoman',
    name: { zh: '小满', en: 'Xiaoman' },
    avatar: av({ hair: 'cl_hair_curly_pink', face: 'cl_face_shy', top: 'cl_top_school', bottom: 'cl_bottom_skirt' }),
    islandSeed: 303,
    greetings: [
      { zh: '啊……你、你好。草莓要熟了，好开心。', en: 'Ah... h-hello. The strawberries are almost ripe. So happy.' },
      { zh: '今天的海风闻起来甜甜的。', en: 'The sea breeze smells sweet today.' },
    ],
    thanks: [
      { zh: '谢谢你……这个贝壳送给你。', en: 'Thank you... please take this shell.' },
    ],
    angry: [
      { zh: '呜……我的花……', en: 'Sniff... my flowers...' },
    ],
    favoriteCrop: 'crop_strawberry',
  },
  {
    id: 'npc_laochuanzhang',
    name: { zh: '老船长', en: 'Old Captain' },
    avatar: av({ skin: 'cl_skin_deep', hair: 'cl_hair_wave_silver', face: 'cl_face_cool', top: 'cl_top_pirate', hat: 'cl_hat_pirate' }),
    islandSeed: 404,
    greetings: [
      { zh: '小子，西边海沟里有大家伙，信不信？', en: 'Kid, there’s a big one in the western trench. Believe it?' },
      { zh: '当年我一网下去，捞上来半船月亮。', en: 'Back in my day, one cast hauled up half a boat of moonlight.' },
    ],
    thanks: [
      { zh: '好水手！值得一杯椰子酒。', en: 'Good sailor! Worth a cup of coconut wine.' },
    ],
    angry: [
      { zh: '谁动了我的甲板？！', en: 'Who touched my deck?!' },
    ],
    favoriteCrop: 'crop_pineapple',
  },
  {
    id: 'npc_atao',
    name: { zh: '阿涛', en: 'Atao' },
    avatar: av({ skin: 'cl_skin_tan', face: 'cl_face_cool', top: 'cl_top_swim', bottom: 'cl_bottom_grass' }),
    islandSeed: 505,
    greetings: [
      { zh: '浪不错！冲完这波就去浇水。', en: 'Nice waves! One more ride, then watering.' },
      { zh: '椰子要从最高那棵摘才够味。', en: 'Coconuts only taste right from the tallest tree.' },
    ],
    thanks: [
      { zh: '够哥们！改天教你冲浪。', en: 'Solid! I’ll teach you to surf sometime.' },
    ],
    angry: [
      { zh: '别拿我的冲浪板垫桌脚啊喂！', en: 'Don’t prop tables with my surfboard!' },
    ],
    favoriteCrop: 'crop_melon',
  },
  {
    id: 'npc_lingdang',
    name: { zh: '铃铛', en: 'Lingdang' },
    avatar: av({ hair: 'cl_hair_pony_gold', face: 'cl_face_happy', top: 'cl_top_hawaii', accessory: 'cl_acc_shell' }),
    islandSeed: 606,
    greetings: [
      { zh: '欢迎光临～今天小铺特价：微笑免费！', en: 'Welcome! Today’s special: smiles are free!' },
      { zh: '你的岛装修得越来越好看了，跟我学的吧？', en: 'Your island keeps getting prettier. Learned from me, right?' },
    ],
    thanks: [
      { zh: '记账上啦，下次给你打折！', en: 'On the books—discount next time!' },
    ],
    angry: [
      { zh: '损坏商品要照价赔偿的哦！', en: 'You break it, you buy it!' },
    ],
    favoriteCrop: 'crop_tomato',
  },
  {
    id: 'npc_mumu',
    name: { zh: '木木', en: 'Mumu' },
    avatar: av({ hair: 'cl_hair_long_black', face: 'cl_face_smile', top: 'cl_top_hoodie', accessory: 'cl_acc_glasses' }),
    islandSeed: 707,
    greetings: [
      { zh: '嘘——南瓜在生长，听。', en: 'Shh—the pumpkins are growing. Listen.' },
      { zh: '我给稻草人起了名字，叫周三。', en: 'I named my scarecrow Wednesday.' },
    ],
    thanks: [
      { zh: '周三说它也谢谢你。', en: 'Wednesday says thanks too.' },
    ],
    angry: [
      { zh: '周三很生气。', en: 'Wednesday is very upset.' },
    ],
    favoriteCrop: 'crop_pumpkin',
  },
  {
    id: 'npc_beibei',
    name: { zh: '贝贝', en: 'Beibei' },
    avatar: av({ hair: 'cl_hair_curly_pink', face: 'cl_face_cat', top: 'cl_top_kimono', hat: 'cl_hat_flower' }),
    islandSeed: 808,
    greetings: [
      { zh: '喵～我家猫说你今天运气不错。', en: 'Meow~ my cat says your luck is good today.' },
      { zh: '收集了 38 种贝壳啦，差 2 种就齐了！', en: '38 shell types collected—2 more to go!' },
    ],
    thanks: [
      { zh: '你是好人，猫都往你身边凑。', en: 'You’re kind—cats can tell.' },
    ],
    angry: [
      { zh: '猫猫们，上！……开玩笑的啦。', en: 'Cats, attack! ...Just kidding.' },
    ],
    favoriteCrop: 'crop_cabbage',
  },
];
