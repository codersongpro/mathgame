export type MathQuestion = {
  id: string;
  prompt: string;
  choices: number[];
  correctAnswer: number;
  hint: string;
};

/** 방별 시드·출제 순서와 교사가 선택한 단으로 각자의 객관식 문제를 만듭니다. */
export function createMathQuestion(index: number, id: string, seed = 0,
  multiplicationTables: number[] = [], divisionEnabled = false, grade: 1 | 2 | 3 | 4 | 5 | 6 = 1): MathQuestion {
  if (multiplicationTables.length > 0) {
    // 선택한 단은 순서대로 돌아가고, 곱하는 수는 1~19에서 바뀝니다.
    const table = multiplicationTables[(seed + index) % multiplicationTables.length]!;
    const factor = 1 + ((Math.floor(index / multiplicationTables.length) + (seed % 19) * 7) % 19);
    const division = divisionEnabled && index % 2 === 1;
    const correctAnswer = division ? factor : table * factor;
    const step = division ? 1 : table;
    const maximum = division ? 19 : 361;
    const choices = [correctAnswer];
    for (let distance = 1; choices.length < 4; distance += 1) {
      for (const candidate of [correctAnswer + step * distance, correctAnswer - step * distance]) {
        if (candidate >= 0 && candidate <= maximum && choices.length < 4) choices.push(candidate);
      }
    }
    const shift = (seed + index) % choices.length;
    return {
      id,
      prompt: division ? `${table * factor} ÷ ${table} = ?` : `${table} × ${factor} = ?`,
      choices: [...choices.slice(shift), ...choices.slice(0, shift)],
      correctAnswer,
      hint: division ? `${table}씩 묶으면 몇 묶음인지 생각해 보세요.`
        : `${table}씩 ${factor}묶음을 생각해 보세요.`,
    };
  }

  if (grade === 1 && index % 3 === 2) {
    // 세 문항 중 하나는 20 이내 수 비교로 바꿉니다. 숫자와 보기 순서는 방별 시드에 따라 달라집니다.
    const variant = (seed + index * 17) % 20_000;
    const base = variant % 14;
    const numbers = [base, base + 2, base + 5, base + 7];
    const shift = variant % numbers.length;
    const choices = [...numbers.slice(shift), ...numbers.slice(0, shift)];
    const largest = index % 2 === 0;
    return {
      id,
      prompt: `${choices.join(", ")} 중 가장 ${largest ? "큰" : "작은"} 수는?`,
      choices,
      correctAnswer: largest ? base + 7 : base,
      hint: largest ? "수를 차례로 비교해 가장 큰 수를 찾아보세요."
        : "수를 차례로 비교해 가장 작은 수를 찾아보세요.",
    };
  }

  if (grade >= 5) {
    // 검수 가능한 정수 답 템플릿 네 종류를 방별 시드와 순서로 바꿔 냅니다.
    const variant = (seed + index * 17) % 20_000;
    let prompt: string;
    let correctAnswer: number;
    let hint: string;
    if (grade === 5 && index % 2 === 0) {
      const middle = 10 + ((variant * 7) % 90);
      const spread = 1 + ((variant * 3) % 9);
      prompt = `${middle - spread}, ${middle}, ${middle + spread}의 평균은?`;
      correctAnswer = middle;
      hint = "세 수를 더한 뒤 3으로 나누어 보세요.";
    } else if (grade === 5) {
      const width = 3 + ((variant * 7) % 18);
      const height = 3 + ((variant * 11) % 18);
      prompt = `가로 ${width}cm, 세로 ${height}cm인 직사각형 넓이(cm²)는?`;
      correctAnswer = width * height;
      hint = "가로와 세로의 길이를 곱해 보세요.";
    } else if (index % 2 === 0) {
      const whole = 20 * (1 + ((variant * 7) % 20));
      const percent = [10, 20, 25, 50][Math.floor(variant / 2) % 4]!;
      prompt = `${whole}의 ${percent}%는?`;
      correctAnswer = whole * percent / 100;
      hint = "전체를 100으로 나눈 뒤 백분율만큼 곱해 보세요.";
    } else {
      const width = 2 + ((variant * 3) % 9);
      const depth = 2 + ((variant * 5) % 9);
      const height = 2 + ((variant * 7) % 9);
      prompt = `가로 ${width}cm·세로 ${depth}cm·높이 ${height}cm의 부피(cm³)는?`;
      correctAnswer = width * depth * height;
      hint = "가로, 세로, 높이의 길이를 모두 곱해 보세요.";
    }
    const choices = [correctAnswer];
    for (let distance = 1; choices.length < 4; distance += 1) {
      for (const candidate of [correctAnswer + distance, correctAnswer - distance]) {
        if (candidate >= 0 && candidate <= 10_000 && choices.length < 4) choices.push(candidate);
      }
    }
    const shift = variant % choices.length;
    return {
      id, prompt, correctAnswer, hint,
      choices: [...choices.slice(shift), ...choices.slice(0, shift)],
    };
  }

  // 선택한 단이 없으면 학년별 기본 범위 안에서 덧셈·뺄셈을 냅니다.
  const variant = (seed + index * 17) % 20_000;
  const addition = variant % 2 === 0;
  const maximum = grade === 4 ? 10_000 : grade === 3 ? 1_000 : grade === 2 ? 100 : 20;
  let left: number;
  if (grade === 1) {
    left = addition ? (variant * 7) % 11 : 6 + ((variant * 7) % 15);
  } else if (grade === 2) {
    left = addition ? (variant * 7) % 101 : 30 + ((variant * 7) % 71);
  } else {
    const lowerBound = grade === 4 ? 3_000 : 300;
    left = addition ? (variant * 37) % (maximum + 1)
      : lowerBound + ((variant * 37) % (maximum - lowerBound + 1));
  }
  const right = addition
    ? (variant * 11 + 3) % (maximum + 1 - left)
    : (variant * 5 + 2) % (left + 1);
  const correctAnswer = addition ? left + right : left - right;
  const choices = [correctAnswer];

  for (let distance = 1; choices.length < 4; distance += 1) {
    for (const candidate of [correctAnswer + distance, correctAnswer - distance]) {
      if (candidate >= 0 && candidate <= maximum && choices.length < 4) choices.push(candidate);
    }
  }

  const shift = variant % choices.length;
  return {
    id,
    prompt: `${left} ${addition ? "+" : "−"} ${right} = ?`,
    choices: [...choices.slice(shift), ...choices.slice(0, shift)],
    correctAnswer,
    hint: addition
      ? `${left}에서 ${right}만큼 앞으로 세어 보세요.`
      : `${left}에서 ${right}만큼 뒤로 세어 보세요.`,
  };
}
