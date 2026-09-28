export type MathQuestion = {
  id: string;
  prompt: string;
  choices: number[];
  correctAnswer: number;
  hint: string;
};

/** 번호만 받아 20 이내의 덧셈·뺄셈과 서로 다른 네 선택지를 만듭니다. */
export function createMathQuestion(index: number, id: string): MathQuestion {
  const addition = index % 2 === 0;
  const left = addition ? (index * 7) % 11 : 6 + ((index * 7) % 15);
  const right = addition
    ? (index * 11 + 3) % (21 - left)
    : (index * 5 + 2) % (left + 1);
  const correctAnswer = addition ? left + right : left - right;
  const choices = [correctAnswer];

  for (let distance = 1; choices.length < 4; distance += 1) {
    for (const candidate of [correctAnswer + distance, correctAnswer - distance]) {
      if (candidate >= 0 && candidate <= 20 && choices.length < 4) choices.push(candidate);
    }
  }

  const shift = index % choices.length;
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
