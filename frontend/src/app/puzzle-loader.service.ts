import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import type { Puzzle } from './puzzles.data';
import { getVisiblePuzzles } from './puzzles.data';

/**
 * Loads puzzles at runtime from /puzzles/index.json (list of dates) and the
 * individual /puzzles/{date}.json files. The `puzzles` signal starts empty and
 * is populated once all files have been fetched.
 */
@Injectable({ providedIn: 'root' })
export class PuzzleLoaderService {
  private readonly http = inject(HttpClient);

  /** Sorted, visible puzzles. Empty until the HTTP requests complete. */
  readonly puzzles = signal<Puzzle[]>([]);

  constructor() {
    this.http.get<string[]>('/puzzles/index.json').pipe(
      switchMap((dates) =>
        dates.length === 0
          ? of([] as Puzzle[])
          : forkJoin(
              dates.map((date) =>
                this.http.get<Puzzle>(`/puzzles/${date}.json`).pipe(
                  catchError(() => of(null))
                )
              )
            )
      ),
      map((list) => {
        // Temporarily populate the static array so getVisiblePuzzles can filter
        // by today's date, then return only the visible (non-future) puzzles.
        const loaded = list.filter(Boolean) as Puzzle[];
        return getVisiblePuzzles(new Date(), loaded);
      }),
      catchError(() => of([] as Puzzle[]))
    ).subscribe((puzzles) => this.puzzles.set(puzzles));
  }
}

