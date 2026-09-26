#!/usr/bin/env bash
# PR-155: prompts/PR-*-prompt.md 를 번호 순서대로 하나씩 클로드 코드 헤드리스 모드로 실행하고
# 결과를 prompt-reports/ 에 저장한다. 이미 보고서가 있는 항목은 건너뛴다(재실행 안전).
# queue-policy: pause-after 인 항목을 처리한 뒤에는 큐를 멈춘다(사람 확인 후 재실행해야 다음으로 진행).
# 에러가 나도 큐를 멈춘다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPTS_DIR="$REPO_ROOT/prompts"
REPORTS_DIR="$REPO_ROOT/prompt-reports"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"

mkdir -p "$REPORTS_DIR"

shopt -s nullglob
files=("$PROMPTS_DIR"/PR-*-prompt.md)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "prompts/ 에 처리할 PR-*-prompt.md 파일이 없습니다."
  exit 0
fi

# PR 번호 기준 오름차순 정렬
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort -t- -k2 -n))
unset IFS

for prompt_file in "${sorted[@]}"; do
  base="$(basename "$prompt_file")"
  pr_no="$(echo "$base" | sed -E 's/^PR-([0-9]+)-prompt\.md$/\1/')"
  report_file="$REPORTS_DIR/PR-${pr_no}-report.md"

  if [ -f "$report_file" ]; then
    echo "[skip] PR-${pr_no}: 이미 처리됨 ($report_file 존재)"
    continue
  fi

  first_line="$(head -n 1 "$prompt_file")"
  policy="pause-after"
  if [[ "$first_line" == *"queue-policy: continue"* ]]; then
    policy="continue"
  elif [[ "$first_line" == *"queue-policy: pause-after"* ]]; then
    policy="pause-after"
  fi

  echo "[run] PR-${pr_no} (queue-policy: ${policy})"

  if ! "$CLAUDE_BIN" -p "$(cat "$prompt_file")" \
      --permission-mode acceptEdits \
      --output-format text \
      > "$report_file.tmp" 2> "$report_file.stderr.tmp"; then
    {
      echo "# PR-${pr_no} 처리 실패"
      echo
      echo "\`claude -p\` 실행이 실패했습니다(종료 코드 != 0). 큐를 멈춥니다."
      echo
      echo '## stderr'
      echo '```'
      cat "$report_file.stderr.tmp"
      echo '```'
    } > "$report_file"
    rm -f "$report_file.tmp" "$report_file.stderr.tmp"
    echo "[error] PR-${pr_no} 처리 중 오류. 큐를 멈춥니다. 보고서: $report_file"
    exit 1
  fi

  mv "$report_file.tmp" "$report_file"
  rm -f "$report_file.stderr.tmp"
  echo "[done] PR-${pr_no} → $report_file"

  if [ "$policy" = "pause-after" ]; then
    echo "[pause] PR-${pr_no}는 queue-policy: pause-after 입니다. 보고서를 확인한 뒤 다시 실행해 다음 항목으로 진행하세요."
    exit 0
  fi
done

echo "큐에 있는 모든 지시서를 처리했습니다."
