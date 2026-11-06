<script lang="ts">
  import { onMount } from 'svelte';
  import { Tabulator } from 'tabulator-tables';
  import 'tabulator-tables/dist/css/tabulator.min.css';

  let listingTab: Tabulator | null = null;

  onMount(() => {
    listingTab = new Tabulator("#listingTab", {
      height: "100%",
      layout: "fitColumns",
      columns: [
        { title: "Filename", field: "filename" },
        { title: "Creation Date", field: "creationDate", width: 160 },
        { title: "Modified Date", field: "modifiedDate", width: 160 },
        { title: "Size", field: "size", width: 100 },
      ],
    });
  });

  function handleLoad() {
    // TODO: wire to Go binding
  }

  function handleSave() {
    // TODO: wire to Go binding
  }

  function handleRecord() {
    // TODO: wire to Go binding
  }

  function handlePlay() {
    // TODO: wire to Go binding
  }

  function handlePlayToEnd() {
    // TODO: wire to Go binding
  }
</script>

<div class="app-container">
  <div class="toolbar">
    <button onclick={handleLoad} title="Load">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3 2-3h5a2 2 0 0 1 2 2z"/>
        <polyline points="14 2 15 22"/>
      </svg>
      Load
    </button>
    <button onclick={handleSave} title="Save">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Save
    </button>
    <button onclick={handleRecord} title="Record">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      Record
    </button>
    <button onclick={handlePlay} title="Play">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Play
    </button>
    <button onclick={handlePlayToEnd} title="Play to End">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true">
        <polygon points="5 3 11 3 16 12 11 21 5 21 5 3"/>
        <line x1="12" y1="3" x2="12" y2="21"/>
      </svg>
      Play to End
    </button>
  </div>
  <div id="listingTab" class="tabulator-container"></div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: var(--ink);
  }
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  .toolbar {
    flex: 0 0 auto;
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    align-items: center;
    background: var(--glass);
    border-bottom: 1px solid var(--glass-border);
  }
  .toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    cursor: pointer;
    background: var(--glass-strong);
    border: 1px solid var(--glass-border);
    color: var(--text);
    border-radius: 6px;
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
  }
  .toolbar button svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .toolbar button:hover {
    background: var(--glass-border);
  }
  .tabulator-container {
    flex: 1 1 auto;
    overflow: hidden;
  }
  /* Match toolbar header styling to Tabulator column headers */
  /*:global(.tabulator .tabulator-header) {
    border-bottom: 1px solid var(--glass-border);
    background: var(--glass);
  }
  :global(.tabulator .tabulator-col) {
    background: var(--glass-strong);
    color: var(--text);
    border: none;
    border-right: 1px solid var(--glass-border);
    font-size: 12px;
    font-weight: 600;
  }
  :global(.tabulator .tabulator-row) {
    border-bottom: 1px solid var(--glass-border);
  }*/
</style>
