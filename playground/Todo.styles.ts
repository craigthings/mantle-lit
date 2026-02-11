import { css } from '../src';

export const styles = css`
  :host {
    display: block;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 1.5rem;
    backdrop-filter: blur(10px);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #e4e4e7;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
    color: #f1f5f9;
  }

  .hmr-version {
    font-size: 0.75rem;
    color: #64748b;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  input {
    flex: 1;
    padding: 0.625rem 0.875rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #e4e4e7;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  input::placeholder {
    color: #64748b;
  }

  button {
    padding: 0.625rem 1rem;
    background: #6366f1;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }

  button:hover {
    background: #4f46e5;
  }

  button:active {
    transform: scale(0.97);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    margin-bottom: 0.375rem;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  li:hover {
    background: rgba(0, 0, 0, 0.25);
  }

  li.done {
    opacity: 0.6;
  }

  li.done .text {
    text-decoration: line-through;
    color: #94a3b8;
  }

  .checkbox {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    color: #6366f1;
  }

  .text {
    flex: 1;
    font-size: 0.9375rem;
  }

  .count {
    margin: 1rem 0 0;
    font-size: 0.8125rem;
    color: #64748b;
    text-align: right;
  }

  .window-size {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: #475569;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;
