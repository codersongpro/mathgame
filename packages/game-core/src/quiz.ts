export type MathQuestion = {
  id: string;
  prompt: string;
  choices: number[];
  correctAnswer: number;
  hint: string;
};

/** 방별 시드와 출제 순서로 20 이내의 문제와 서로 다른 네 선택지를 만듭니다. */
export function createMathQuestion(index: number, id: string, seed = 0): MathQuestion {
  const variant = (seed + index * 17) % 20_000;
  const addition = variant % 2 === 0;
  const left = addition ? (variant * 7) % 11 : 6 + ((variant * 7) % 15);
  const right = addition
    ? (variant * 11 + 3) % (21 - left)
    : (variant * 5 + 2) % (left + 1);
  const correctAnswer = addition ? left + right : left - right;
  const choices = [correctAnswer];

  for (let distance = 1; choices.length < 4; distance += 1) {
    for (const candidate of [correctAnswer + distance, correctAnswer - distance]) {
      if (candidate >= 0 && candidate <= 20 && choices.length < 4) choices.push(candidate);
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
