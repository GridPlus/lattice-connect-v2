import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

// Basic rendering and section tests

describe('App Component', () => {
  it('renders the main title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Lattice Connect Local Test UI/i })).toBeInTheDocument();
  });

  it('renders all interactive sections', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Connect to Device/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pair with Device/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Call Device Method/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sign Request/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Provision New User/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Response/i })).toBeInTheDocument();
  });
}); 