/**
 * Example 5: Kanban board interaction
 * Full HUD demo — cursor moves between columns, clicks cards to select them,
 * clicks column headers to move cards, adds a new task via inline input.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0f0f23; color: #ccc; min-height: 100vh; }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 30px; background: #1a1a3e; border-bottom: 1px solid #333366; }
  .topbar .logo { color: #ffcc00; font-weight: 700; font-size: 18px; }
  .topbar .sprint { color: #8888aa; font-size: 14px; }
  .board { display: flex; gap: 20px; padding: 24px 30px; height: calc(100vh - 56px); }
  .column { flex: 1; background: #161638; border-radius: 12px; border: 1px solid #333366; display: flex; flex-direction: column; min-width: 0; }
  .column-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #333366; cursor: pointer; border-radius: 12px 12px 0 0; transition: background 0.2s; }
  .column-header:hover { background: #1e1e50; }
  .column-header.drop-target { background: #2a2a5e; box-shadow: inset 0 0 0 2px #ffcc00; }
  .column-header h3 { color: #fff; font-size: 15px; font-weight: 600; }
  .count-badge { background: #333366; color: #aaa; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; min-width: 22px; text-align: center; }
  .column-body { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .card { background: #1a1a3e; border: 1px solid #333366; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.25s ease; position: relative; }
  .card:hover { border-color: #5555aa; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  .card.selected { border-color: #ffcc00; box-shadow: 0 0 0 2px rgba(255,204,0,0.3), 0 4px 12px rgba(0,0,0,0.3); }
  .card.moving { opacity: 0; transform: scale(0.9); }
  .card .card-title { color: #fff; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
  .card .card-meta { display: flex; align-items: center; gap: 8px; }
  .priority { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .priority.high { background: #3a1a1a; color: #ff6b6b; }
  .priority.medium { background: #3a3a1a; color: #feca57; }
  .priority.low { background: #1a3a2a; color: #55efc4; }
  .card .assignee { color: #8888aa; font-size: 12px; }
  .add-task-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; margin: 0 12px 12px; background: transparent; border: 1px dashed #333366; border-radius: 8px; color: #666699; font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .add-task-btn:hover { border-color: #5555aa; color: #8888cc; background: rgba(85,85,170,0.1); }
  .add-input { display: none; margin: 0 12px 12px; }
  .add-input.show { display: block; }
  .add-input input { width: 100%; padding: 10px 12px; background: #0f0f23; border: 1px solid #ffcc00; border-radius: 8px; color: #fff; font-size: 14px; font-family: system-ui, sans-serif; outline: none; }
  .add-input input::placeholder { color: #555577; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #2a2a5e; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: 14px; border: 1px solid #333366; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; }
</style></head><body>
  <div class="topbar">
    <span class="logo">📋 Sprint Board</span>
    <span class="sprint">Sprint 14 · Apr 1–14</span>
  </div>
  <div class="board">
    <div class="column" id="col-todo">
      <div class="column-header" id="header-todo" data-col="todo">
        <h3>📝 To Do</h3>
        <span class="count-badge" id="count-todo">3</span>
      </div>
      <div class="column-body" id="body-todo">
        <div class="card" id="card-1" data-col="todo"><div class="card-title">Set up CI pipeline</div><div class="card-meta"><span class="priority high">High</span><span class="assignee">@alice</span></div></div>
        <div class="card" id="card-2" data-col="todo"><div class="card-title">Design login page</div><div class="card-meta"><span class="priority medium">Medium</span><span class="assignee">@bob</span></div></div>
        <div class="card" id="card-3" data-col="todo"><div class="card-title">Write API docs</div><div class="card-meta"><span class="priority low">Low</span><span class="assignee">@carol</span></div></div>
      </div>
      <button class="add-task-btn" id="add-task-btn">+ Add Task</button>
      <div class="add-input" id="add-input">
        <input id="new-task-input" placeholder="Task name… press Enter" />
      </div>
    </div>
    <div class="column" id="col-progress">
      <div class="column-header" id="header-progress" data-col="progress">
        <h3>🔨 In Progress</h3>
        <span class="count-badge" id="count-progress">2</span>
      </div>
      <div class="column-body" id="body-progress">
        <div class="card" id="card-4" data-col="progress"><div class="card-title">Build auth module</div><div class="card-meta"><span class="priority high">High</span><span class="assignee">@dave</span></div></div>
        <div class="card" id="card-5" data-col="progress"><div class="card-title">Create dashboard widgets</div><div class="card-meta"><span class="priority medium">Medium</span><span class="assignee">@alice</span></div></div>
      </div>
    </div>
    <div class="column" id="col-done">
      <div class="column-header" id="header-done" data-col="done">
        <h3>✅ Done</h3>
        <span class="count-badge" id="count-done">2</span>
      </div>
      <div class="column-body" id="body-done">
        <div class="card" id="card-6" data-col="done"><div class="card-title">Set up repo</div><div class="card-meta"><span class="priority low">Low</span><span class="assignee">@bob</span></div></div>
        <div class="card" id="card-7" data-col="done"><div class="card-title">Define user stories</div><div class="card-meta"><span class="priority medium">Medium</span><span class="assignee">@carol</span></div></div>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    let selectedCard = null;

    function updateCounts() {
      document.getElementById('count-todo').textContent = document.querySelectorAll('#body-todo .card').length;
      document.getElementById('count-progress').textContent = document.querySelectorAll('#body-progress .card').length;
      document.getElementById('count-done').textContent = document.querySelectorAll('#body-done .card').length;
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    // Click a card to select it
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        if (selectedCard === card) {
          card.classList.remove('selected');
          selectedCard = null;
          document.querySelectorAll('.column-header').forEach(h => h.classList.remove('drop-target'));
          return;
        }
        if (selectedCard) selectedCard.classList.remove('selected');
        selectedCard = card;
        card.classList.add('selected');
        // Highlight other column headers as drop targets
        document.querySelectorAll('.column-header').forEach(h => {
          if (h.dataset.col !== card.dataset.col) {
            h.classList.add('drop-target');
          } else {
            h.classList.remove('drop-target');
          }
        });
      });
    });

    // Click a column header to move the selected card there
    document.querySelectorAll('.column-header').forEach(header => {
      header.addEventListener('click', () => {
        if (!selectedCard) return;
        const targetCol = header.dataset.col;
        if (selectedCard.dataset.col === targetCol) return;

        const bodyId = 'body-' + targetCol;
        const targetBody = document.getElementById(bodyId);
        const cardTitle = selectedCard.querySelector('.card-title').textContent;

        selectedCard.dataset.col = targetCol;
        targetBody.appendChild(selectedCard);
        selectedCard.classList.remove('selected');
        selectedCard = null;
        document.querySelectorAll('.column-header').forEach(h => h.classList.remove('drop-target'));
        updateCounts();
        showToast('Moved "' + cardTitle + '" → ' + header.querySelector('h3').textContent);
      });
    });

    // Add task
    document.getElementById('add-task-btn').addEventListener('click', () => {
      document.getElementById('add-task-btn').style.display = 'none';
      document.getElementById('add-input').classList.add('show');
      document.getElementById('new-task-input').focus();
    });

    document.getElementById('new-task-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const name = e.target.value.trim();
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.col = 'todo';
        card.id = 'card-new';
        card.innerHTML = '<div class="card-title">' + name + '</div><div class="card-meta"><span class="priority medium">Medium</span><span class="assignee">@you</span></div>';
        card.style.opacity = '0';
        card.style.transform = 'translateY(-10px)';
        document.getElementById('body-todo').appendChild(card);
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
        // Make new card clickable
        card.addEventListener('click', () => {
          if (selectedCard === card) {
            card.classList.remove('selected');
            selectedCard = null;
            document.querySelectorAll('.column-header').forEach(h => h.classList.remove('drop-target'));
            return;
          }
          if (selectedCard) selectedCard.classList.remove('selected');
          selectedCard = card;
          card.classList.add('selected');
          document.querySelectorAll('.column-header').forEach(h => {
            if (h.dataset.col !== card.dataset.col) h.classList.add('drop-target');
            else h.classList.remove('drop-target');
          });
        });
        e.target.value = '';
        document.getElementById('add-input').classList.remove('show');
        document.getElementById('add-task-btn').style.display = 'flex';
        updateCounts();
        showToast('Added "' + name + '" to To Do');
      }
    });
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

test("kanban board — move cards between columns, add a task", async ({ page }) => {
  const plan = createVideoScript()
    .segment(
      "Welcome to our sprint board. Let's review all the columns and cards before we start organizing the work.",
      async (pace) => {
        await moveToEl(page, "#header-todo");
        await pace();
        await moveToEl(page, "#card-1");
        await pace();
        await moveToEl(page, "#card-2");
        await pace();
        await moveToEl(page, "#card-3");
        await pace();
      },
    )
    .segment(
      "Now let's look at the In Progress column. There are two tasks currently being worked on by the team.",
      async (pace) => {
        await moveToEl(page, "#header-progress");
        await pace();
        await moveToEl(page, "#card-4");
        await pace();
        await moveToEl(page, "#card-5");
        await pace();
      },
    )
    .segment(
      "And here's the Done column. Two tasks have already been completed this sprint. Good progress so far.",
      async (pace) => {
        await moveToEl(page, "#header-done");
        await pace();
        await moveToEl(page, "#card-6");
        await pace();
        await moveToEl(page, "#card-7");
        await pace();
      },
    )
    .segment(
      "Let's move the CI pipeline task from To Do into In Progress. We select the card, then click the target column header.",
      async (pace) => {
        await clickEl(page, "#card-1");
        await pace();
        await clickEl(page, "#header-progress");
        await pace();
      },
    )
    .segment(
      "Next we'll move the dashboard widgets task from In Progress over to Done, since that work is now complete.",
      async (pace) => {
        await clickEl(page, "#card-5");
        await pace();
        await clickEl(page, "#header-done");
        await pace();
      },
    )
    .segment(
      "Finally, let's add a brand new task to the board. We click the add button, type in the task name, and press Enter to confirm.",
      async (pace) => {
        await clickEl(page, "#add-task-btn");
        await pace();
        await clickEl(page, "#new-task-input");
        await page.evaluate(() => (document.querySelector("#new-task-input") as HTMLInputElement).focus());
        await pace();
        await typeKeys(page, "Implement dark mode", 65, "#new-task-input");
        await pace();
        await page.evaluate(() => {
          const input = document.querySelector("#new-task-input") as HTMLInputElement;
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });
        await pace();
      },
    )
    .segment(
      "And that's it — our sprint board is now fully organized. Tasks have been moved and a new item has been added successfully.",
    );

  await page.goto(baseUrl);

  const result = await plan.run(page);

  for (const entry of result.timeline) {
    console.log(
      `  [${entry.startMs.toFixed(0).padStart(6)}ms] "${entry.text.slice(0, 50)}…" — ${entry.durationMs.toFixed(0)}ms`,
    );
  }
  console.log(`  Total: ${result.totalMs.toFixed(0)}ms`);

  const card1Col = await page.evaluate(() => document.getElementById("card-1")?.closest(".column")?.id);
  expect(card1Col).toBe("col-progress");

  const card5Col = await page.evaluate(() => document.getElementById("card-5")?.closest(".column")?.id);
  expect(card5Col).toBe("col-done");

  const newCardCol = await page.evaluate(() => document.getElementById("card-new")?.closest(".column")?.id);
  expect(newCardCol).toBe("col-todo");

  const todoCt = await page.evaluate(() => document.getElementById("count-todo")?.textContent);
  expect(todoCt).toBe("3");

  const progressCt = await page.evaluate(() => document.getElementById("count-progress")?.textContent);
  expect(progressCt).toBe("2");

  const doneCt = await page.evaluate(() => document.getElementById("count-done")?.textContent);
  expect(doneCt).toBe("3");
});
