export interface SeasonalFood {
  name: string;
  description: string;
  imageUrl?: string;
  month: number[]; // 제철 월 (1~12)
  recommendedDishes: string[]; // 추천 요리
}

export const seasonalFoods: SeasonalFood[] = [
  // 1월
  {
    name: "우엉",
    description:
      "아삭아삭한 식감과 독특한 향이 매력적인 뿌리채소. 조림, 튀김, 찌개 등 다양한 요리에 활용됩니다.",
    month: [1, 2, 3],
    recommendedDishes: ["우엉조림", "우엉잡채", "우엉튀김", "우엉차"],
  },
  {
    name: "더덕",
    description:
      "진한 향과 쌉싸름한 맛이 일품인 '산에서 나는 고기'. 구이, 무침 등으로 즐겨 먹습니다.",
    month: [1, 2, 3, 4],
    recommendedDishes: ["더덕구이", "더덕무침", "더덕장아찌"],
  },
  {
    name: "딸기",
    description:
      "붉은 색감과 달콤한 맛으로 남녀노소 누구나 좋아하는 과일. 비타민 C가 풍부합니다.",
    month: [1, 2, 3, 4, 5],
    recommendedDishes: ["딸기잼", "딸기파이", "딸기샐러드", "딸기라떼"],
  },

  // 2월
  {
    name: "한라봉",
    description:
      "제주도의 특산물로, 톡 튀어 나온 꼭지가 특징입니다. 당도가 높고 과즙이 풍부합니다.",
    month: [12, 1, 2, 3],
    recommendedDishes: ["한라봉차", "한라봉샐러드", "한라봉에이드"],
  },
  {
    name: "바지락",
    description:
      "시원한 국물 맛을 내는 일등공신. 칼국수, 찌개, 찜 등 다양하게 활용됩니다.",
    month: [2, 3, 4],
    recommendedDishes: ["바지락칼국수", "바지락술찜", "봉골레파스타"],
  },

  // 3월
  {
    name: "달래",
    description:
      "톡 쏘는 매운맛과 향긋한 향이 봄을 알리는 대표적인 봄나물. 된장찌개나 무침으로 좋습니다.",
    month: [3, 4],
    recommendedDishes: ["달래된장찌개", "달래양념장", "달래전"],
  },
  {
    name: "냉이",
    description:
      "쌉쌀한 향과 맛이 잃어버린 입맛을 돋워줍니다. 단백질과 비타민이 풍부한 알칼리성 식품입니다.",
    month: [3, 4],
    recommendedDishes: ["냉이된장국", "냉이무침", "냉이튀김"],
  },
  {
    name: "쭈꾸미",
    description:
      "봄철 최고의 별미. 쫄깃한 식감과 감칠맛이 뛰어나며 타우린이 풍부하여 피로 회복에 좋습니다.",
    month: [3, 4, 5],
    recommendedDishes: ["쭈꾸미볶음", "쭈꾸미샤브샤브", "쭈꾸미숙회"],
  },

  // 4월
  {
    name: "두릅",
    description:
      "쌉싸름한 향이 일품인 '산채의 제왕'. 살짝 데쳐서 초고추장에 찍어 먹으면 별미입니다.",
    month: [4, 5],
    recommendedDishes: ["두릅숙회", "두릅장아찌", "두릅전"],
  },
  {
    name: "키조개",
    description:
      "곡식을 까부는 '키'를 닮았다고 하여 붙여진 이름. 담백하고 쫄깃한 관자가 일품입니다.",
    month: [4, 5],
    recommendedDishes: ["키조개관자구이", "키조개무침", "미역국"],
  },

  // 5월
  {
    name: "매실",
    description:
      "새콤달콤한 맛과 향이 특징. 매실청, 장아찌, 주 등으로 만들어 먹습니다.",
    month: [5, 6],
    recommendedDishes: ["매실청", "매실장아찌", "매실주"],
  },
  {
    name: "장어",
    description:
      "대표적인 보양식. 단백질과 비타민 A가 풍부하여 기력 회복에 좋습니다.",
    month: [5, 6, 7],
    recommendedDishes: ["장어구이", "장어덮밥", "장어탕"],
  },

  // 6월
  {
    name: "감자",
    description:
      "'땅 속의 사과'라 불릴 만큼 비타민 C가 풍부합니다. 삶거나 튀겨서 간식으로 즐기기 좋습니다.",
    month: [6, 7, 8, 9],
    recommendedDishes: ["감자조림", "감자전", "감자튀김", "옹심이"],
  },
  {
    name: "복분자",
    description:
      "남자의 기력을 돋운다는 의미를 가진 열매. 달콤하고 진한 맛이 특징입니다.",
    month: [6, 7, 8],
    recommendedDishes: ["복분자주", "복분자청", "복분자스무디"],
  },

  // 7월
  {
    name: "수박",
    description:
      "여름철 갈증 해소에 최고인 과일. 달콤하고 시원한 과즙이 풍부합니다.",
    month: [7, 8],
    recommendedDishes: ["수박화채", "수박주스", "수박무침"],
  },
  {
    name: "복숭아",
    description:
      "달콤한 향과 맛이 매력적인 여름 과일. 피부 미용과 피로 회복에 좋습니다.",
    month: [7, 8],
    recommendedDishes: ["복숭아잼", "복숭아빙수", "복숭아통조림"],
  },
  {
    name: "도라지",
    description:
      "기관지 건강에 좋은 대표적인 식품. 쌉쌀한 맛이 있어 나물이나 무침으로 먹습니다.",
    month: [7, 8],
    recommendedDishes: ["도라지무침", "도라지볶음", "도라지차"],
  },

  // 8월
  {
    name: "포도",
    description:
      "비타민과 유기산이 풍부하여 피로 회복에 탁월합니다. 달콤하고 상큼한 맛이 일품입니다.",
    month: [8, 9, 10],
    recommendedDishes: ["포도잼", "포도주스", "포도젤리"],
  },
  {
    name: "전복",
    description:
      "'바다의 명품'이라 불리는 보양식. 비타민과 미네랄이 풍부하고 맛이 좋습니다.",
    month: [8, 9, 10],
    recommendedDishes: ["전복죽", "전복버터구이", "전복회"],
  },

  // 9월
  {
    name: "꽃게",
    description:
      "가을철 대표적인 수산물. 찜, 탕, 게장 등 다양한 요리로 즐길 수 있습니다.",
    month: [9, 10],
    recommendedDishes: ["꽃게탕", "간장게장", "양념게장", "꽃게찜"],
  },
  {
    name: "대하",
    description:
      "몸집이 큰 새우. 구이, 튀김 등으로 먹으면 고소하고 단맛이 납니다.",
    month: [9, 10, 11, 12],
    recommendedDishes: ["대하구이", "새우튀김", "새우장"],
  },
  {
    name: "배",
    description:
      "시원하고 달콤한 과즙이 풍부합니다. 기관지에 좋고 소화를 돕는 효능이 있습니다.",
    month: [9, 10, 11],
    recommendedDishes: ["배숙", "배깍두기", "육회"],
  },

  // 10월
  {
    name: "사과",
    description:
      "새콤달콤한 맛과 아삭한 식감이 일품. 비타민 C와 식이섬유가 풍부합니다.",
    month: [10, 11, 12],
    recommendedDishes: ["사과잼", "사과파이", "사과샐러드"],
  },
  {
    name: "고구마",
    description:
      "달콤하고 부드러운 맛으로 사랑받는 간식. 식이섬유가 풍부하여 다이어트에도 좋습니다.",
    month: [8, 9, 10, 11, 12, 1], // 저장 고구마 포함 넓게 잡음
    recommendedDishes: ["고구마맛탕", "군고구마", "고구마라떼"],
  },
  {
    name: "굴",
    description:
      "'바다의 우유'라 불릴 만큼 영양소가 풍부합니다. 생으로 먹거나 찜, 구이로 즐깁니다.",
    month: [9, 10, 11, 12],
    recommendedDishes: ["굴전", "생굴", "굴국밥", "굴무침"],
  },

  // 11월
  {
    name: "배추",
    description: "김장의 주재료. 식이섬유와 비타민 C, 칼슘이 풍부합니다.",
    month: [11, 12],
    recommendedDishes: ["김치", "배추전", "배추된장국"],
  },
  {
    name: "꼬막",
    description:
      "쫄깃한 식감과 감칠맛이 일품. 양념에 무쳐 먹으면 밥도둑이 따로 없습니다.",
    month: [11, 12, 1, 2, 3],
    recommendedDishes: ["꼬막무침", "꼬막비빔밥", "꼬막찜"],
  },
  {
    name: "과메기",
    description:
      "겨울철 별미. 꽁치나 청어를 말려서 만듭니다. 고소하고 쫀득한 맛이 특징입니다.",
    month: [11, 12, 1],
    recommendedDishes: ["과메기쌈", "과메기무침", "과메기졸림"],
  },

  // 12월
  {
    name: "명태",
    description:
      "지방이 적고 단백질이 풍부하여 맛이 담백합니다. 생태, 동태, 황태 등 다양하게 즐깁니다.",
    month: [12, 1],
    recommendedDishes: ["동태찌개", "황태국", "명태조림"],
  },
  {
    name: "귤",
    description: "겨울철 대표 간식. 비타민 C가 풍부하여 감기 예방에 좋습니다.",
    month: [10, 11, 12, 1],
    recommendedDishes: ["귤잼", "귤차", "귤 샐러드"],
  },
];

export const getSeasonalFoods = (month: number): SeasonalFood[] => {
  return seasonalFoods.filter((food) => food.month.includes(month));
};
