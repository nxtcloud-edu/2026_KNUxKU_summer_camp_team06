import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Clock,
  Grid3x3,
  List,
  Search,
  Filter,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface Event {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  color: string;
  category?: string;
  attendees?: string[];
  tags?: string[];
  /** 마감처럼 사용자가 옮길 수 없는 일정 */
  locked?: boolean;
}

export interface EventColor {
  name: string;
  value: string;
  bg: string;
  text: string;
}

/** Every user-facing string, so the component can be localized per app. */
export interface EventManagerLabels {
  monthView: string;
  weekView: string;
  dayView: string;
  listView: string;
  month: string;
  week: string;
  day: string;
  list: string;
  weekOf: (date: string) => string;
  allEvents: string;
  today: string;
  newEvent: string;
  searchPlaceholder: string;
  clearSearch: string;
  colors: string;
  tags: string;
  categories: string;
  filterByColor: string;
  filterByTag: string;
  filterByCategory: string;
  clear: string;
  clearFilters: string;
  activeFilters: string;
  createTitle: string;
  createDescription: string;
  detailTitle: string;
  detailDescription: string;
  titleField: string;
  titlePlaceholder: string;
  descriptionField: string;
  descriptionPlaceholder: string;
  startTimeField: string;
  endTimeField: string;
  categoryField: string;
  selectCategory: string;
  colorField: string;
  selectColor: string;
  tagsField: string;
  delete: string;
  cancel: string;
  create: string;
  save: string;
  weekdays: [string, string, string, string, string, string, string];
  timeColumn: string;
  more: (count: number) => string;
  noEvents: string;
  hourSuffix: string;
  minuteSuffix: string;
  /** Side panel */
  selectedDayLabel: string;
  noEventsForDay: string;
  eventCount: (count: number) => string;
  /** Week / day hour range toggle */
  showAllHours: string;
  showCoreHours: string;
  /** Caption for events that fall outside the visible hour range */
  outsideRange: string;
  previousPeriod: string;
  nextPeriod: string;
}

export interface EventManagerProps {
  events?: Event[];
  onEventCreate?: (event: Omit<Event, 'id'>) => void;
  onEventUpdate?: (id: string, event: Partial<Event>) => void;
  onEventDelete?: (id: string) => void;
  categories?: string[];
  colors?: EventColor[];
  defaultView?: 'month' | 'week' | 'day' | 'list';
  className?: string;
  availableTags?: string[];
  /** BCP 47 tag used for every rendered date and time. */
  locale?: string;
  labels?: Partial<EventManagerLabels>;
  /**
   * 이벤트를 눌렀을 때 먼저 호출된다. true를 반환하면 편집 다이얼로그를 열지 않는다.
   * (계획 단계를 실행 계획 화면으로 보낼 때 사용)
   */
  onEventSelect?: (event: Event) => boolean;
  /** 검색 매칭 규칙 교체 (기본값은 소문자 포함 검색) */
  matchQuery?: (text: string, query: string) => boolean;
  /** Show the "selected day" agenda panel beside the calendar. */
  showAgenda?: boolean;
  /**
   * Hours rendered by the week and day views, as [start, end) in 24h form.
   * A full 0–24 grid is very tall, so this trims it; the user can still
   * expand to the full day from the toolbar.
   */
  hourRange?: [number, number];
}

const defaultColors: EventColor[] = [
  { name: 'Blue', value: 'blue', bg: 'bg-blue-500', text: 'text-blue-700' },
  { name: 'Green', value: 'green', bg: 'bg-green-500', text: 'text-green-700' },
  {
    name: 'Purple',
    value: 'purple',
    bg: 'bg-purple-500',
    text: 'text-purple-700',
  },
  {
    name: 'Orange',
    value: 'orange',
    bg: 'bg-orange-500',
    text: 'text-orange-700',
  },
  { name: 'Pink', value: 'pink', bg: 'bg-pink-500', text: 'text-pink-700' },
  { name: 'Red', value: 'red', bg: 'bg-red-500', text: 'text-red-700' },
];

const defaultLabels: EventManagerLabels = {
  monthView: 'Month View',
  weekView: 'Week View',
  dayView: 'Day View',
  listView: 'List View',
  month: 'Month',
  week: 'Week',
  day: 'Day',
  list: 'List',
  weekOf: (date) => `Week of ${date}`,
  allEvents: 'All Events',
  today: 'Today',
  newEvent: 'New Event',
  searchPlaceholder: 'Search events...',
  clearSearch: 'Clear search',
  colors: 'Colors',
  tags: 'Tags',
  categories: 'Categories',
  filterByColor: 'Filter by Color',
  filterByTag: 'Filter by Tag',
  filterByCategory: 'Filter by Category',
  clear: 'Clear',
  clearFilters: 'Clear Filters',
  activeFilters: 'Active filters:',
  createTitle: 'Create Event',
  createDescription: 'Add a new event to your calendar',
  detailTitle: 'Event Details',
  detailDescription: 'View and edit event details',
  titleField: 'Title',
  titlePlaceholder: 'Event title',
  descriptionField: 'Description',
  descriptionPlaceholder: 'Event description',
  startTimeField: 'Start Time',
  endTimeField: 'End Time',
  categoryField: 'Category',
  selectCategory: 'Select category',
  colorField: 'Color',
  selectColor: 'Select color',
  tagsField: 'Tags',
  delete: 'Delete',
  cancel: 'Cancel',
  create: 'Create',
  save: 'Save',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  timeColumn: 'Time',
  more: (count) => `+${count} more`,
  noEvents: 'No events found',
  hourSuffix: 'h',
  minuteSuffix: 'm',
  selectedDayLabel: 'SELECTED DAY',
  noEventsForDay: 'Nothing scheduled for this day.',
  eventCount: (count) => `${count} events`,
  showAllHours: 'Full day',
  showCoreHours: 'Core hours',
  outsideRange: 'Outside these hours',
  previousPeriod: 'Previous',
  nextPeriod: 'Next',
};

function toLocalInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

const sectionLabel =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

export function EventManager({
  events: initialEvents = [],
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  categories = ['Meeting', 'Task', 'Reminder', 'Personal'],
  colors = defaultColors,
  defaultView = 'month',
  className,
  availableTags = [
    'Important',
    'Urgent',
    'Work',
    'Personal',
    'Team',
    'Client',
  ],
  locale = 'en-US',
  labels: labelOverrides,
  showAgenda = false,
  hourRange = [0, 24],
  onEventSelect,
  matchQuery,
}: EventManagerProps) {
  const labels = useMemo(
    () => ({ ...defaultLabels, ...labelOverrides }),
    [labelOverrides],
  );
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day' | 'list'>(
    defaultView,
  );
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<Event | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<Event>>({
    title: '',
    description: '',
    color: colors[0].value,
    category: categories[0],
    tags: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Search filter. matchQuery 를 넘기면 언어별 매칭 규칙을 갈아끼울 수 있다.
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const test = matchQuery ?? ((text: string, q: string) => text.toLowerCase().includes(q));
        const matchesSearch =
          test(event.title, query) ||
          (event.description ? test(event.description, query) : false) ||
          (event.category ? test(event.category, query) : false) ||
          (event.tags?.some((tag) => test(tag, query)) ?? false);
        if (!matchesSearch) return false;
      }

      // Color filter
      if (selectedColors.length > 0 && !selectedColors.includes(event.color)) {
        return false;
      }

      // Tag filter
      if (selectedTags.length > 0) {
        const hasMatchingTag = event.tags?.some((tag) =>
          selectedTags.includes(tag),
        );
        if (!hasMatchingTag) return false;
      }

      // Category filter
      if (
        selectedCategories.length > 0 &&
        event.category &&
        !selectedCategories.includes(event.category)
      ) {
        return false;
      }

      return true;
    });
  }, [events, searchQuery, selectedColors, selectedTags, selectedCategories, matchQuery]);

  const hasActiveFilters =
    selectedColors.length > 0 ||
    selectedTags.length > 0 ||
    selectedCategories.length > 0;

  const clearFilters = () => {
    setSelectedColors([]);
    setSelectedTags([]);
    setSelectedCategories([]);
    setSearchQuery('');
  };

  const hours = useMemo(() => {
    const [start, end] = showAllHours ? [0, 24] : hourRange;
    const from = Math.max(0, Math.min(23, start));
    const to = Math.max(from + 1, Math.min(24, end));
    return Array.from({ length: to - from }, (_, i) => from + i);
  }, [hourRange, showAllHours]);

  const isTrimmedRange = hourRange[0] > 0 || hourRange[1] < 24;

  const selectedDayEvents = useMemo(
    () =>
      filteredEvents
        .filter((event) => isSameDay(event.startTime, selectedDate))
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    [filteredEvents, selectedDate],
  );

  const handleCreateEvent = useCallback(() => {
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime) return;

    const event: Event = {
      id: Math.random().toString(36).slice(2, 11),
      title: newEvent.title,
      description: newEvent.description,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      color: newEvent.color || colors[0].value,
      category: newEvent.category,
      attendees: newEvent.attendees,
      tags: newEvent.tags || [],
    };

    setEvents((prev) => [...prev, event]);
    onEventCreate?.(event);
    setIsDialogOpen(false);
    setIsCreating(false);
    setNewEvent({
      title: '',
      description: '',
      color: colors[0].value,
      category: categories[0],
      tags: [],
    });
  }, [newEvent, colors, categories, onEventCreate]);

  const handleUpdateEvent = useCallback(() => {
    if (!selectedEvent) return;

    setEvents((prev) =>
      prev.map((e) => (e.id === selectedEvent.id ? selectedEvent : e)),
    );
    onEventUpdate?.(selectedEvent.id, selectedEvent);
    setIsDialogOpen(false);
    setSelectedEvent(null);
  }, [selectedEvent, onEventUpdate]);

  const handleDeleteEvent = useCallback(
    (id: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      onEventDelete?.(id);
      setIsDialogOpen(false);
      setSelectedEvent(null);
    },
    [onEventDelete],
  );

  const handleDragStart = useCallback((event: Event) => {
    setDraggedEvent(event);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEvent(null);
  }, []);

  const handleDrop = useCallback(
    (date: Date, hour?: number) => {
      if (!draggedEvent) return;

      const duration =
        draggedEvent.endTime.getTime() - draggedEvent.startTime.getTime();
      const newStartTime = new Date(date);
      if (hour !== undefined) {
        newStartTime.setHours(hour, 0, 0, 0);
      } else {
        newStartTime.setHours(
          draggedEvent.startTime.getHours(),
          draggedEvent.startTime.getMinutes(),
          0,
          0,
        );
      }
      const newEndTime = new Date(newStartTime.getTime() + duration);

      const updatedEvent = {
        ...draggedEvent,
        startTime: newStartTime,
        endTime: newEndTime,
      };

      setEvents((prev) =>
        prev.map((e) => (e.id === draggedEvent.id ? updatedEvent : e)),
      );
      onEventUpdate?.(draggedEvent.id, updatedEvent);
      setDraggedEvent(null);
    },
    [draggedEvent, onEventUpdate],
  );

  const navigateDate = useCallback(
    (direction: 'prev' | 'next') => {
      const step = direction === 'next' ? 1 : -1;
      setCurrentDate((prev) => {
        const newDate = new Date(prev);
        if (view === 'month') {
          newDate.setMonth(prev.getMonth() + step);
        } else if (view === 'week') {
          newDate.setDate(prev.getDate() + step * 7);
        } else if (view === 'day') {
          newDate.setDate(prev.getDate() + step);
        }
        return newDate;
      });
      if (view === 'day') {
        setSelectedDate((prev) => {
          const next = new Date(prev);
          next.setDate(prev.getDate() + step);
          return next;
        });
      }
    },
    [view],
  );

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }, []);

  const getColorClasses = useCallback(
    (colorValue: string) => {
      const color = colors.find((c) => c.value === colorValue);
      return color || colors[0];
    },
    [colors],
  );

  const openEvent = useCallback(
    (event: Event) => {
      setSelectedDate(new Date(event.startTime));
      if (onEventSelect?.(event)) return;
      setSelectedEvent(event);
      setIsCreating(false);
      setIsDialogOpen(true);
    },
    [onEventSelect],
  );

  const selectDay = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const toggleTag = (tag: string, creating: boolean) => {
    if (creating) {
      setNewEvent((prev) => ({
        ...prev,
        tags: prev.tags?.includes(tag)
          ? prev.tags.filter((t) => t !== tag)
          : [...(prev.tags || []), tag],
      }));
    } else {
      setSelectedEvent((prev) =>
        prev
          ? {
              ...prev,
              tags: prev.tags?.includes(tag)
                ? prev.tags.filter((t) => t !== tag)
                : [...(prev.tags || []), tag],
            }
          : null,
      );
    }
  };

  const periodTitle =
    view === 'month'
      ? currentDate.toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
        })
      : view === 'week'
        ? labels.weekOf(
            currentDate.toLocaleDateString(locale, {
              month: 'short',
              day: 'numeric',
            }),
          )
        : view === 'day'
          ? currentDate.toLocaleDateString(locale, {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })
          : labels.allEvents;

  const viewOptions = [
    { value: 'month' as const, icon: Calendar, short: labels.month, long: labels.monthView },
    { value: 'week' as const, icon: Grid3x3, short: labels.week, long: labels.weekView },
    { value: 'day' as const, icon: Clock, short: labels.day, long: labels.dayView },
    { value: 'list' as const, icon: List, short: labels.list, long: labels.listView },
  ];

  return (
    <div className={cn('tw-root flex flex-col gap-4 text-[15px]', className)}>
      {/* Toolbar: navigation, view switch, search and filters in one framed panel */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateDate('prev')}
                className="h-8 w-8"
                aria-label={labels.previousPeriod}
                disabled={view === 'list'}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToToday}
                className="h-8 px-2 text-xs font-semibold"
              >
                {labels.today}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateDate('next')}
                className="h-8 w-8"
                aria-label={labels.nextPeriod}
                disabled={view === 'list'}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-lg font-bold tracking-[-0.02em] tabular-nums sm:text-xl">
              {periodTitle}
            </h2>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Mobile: Select dropdown */}
            <div className="sm:hidden">
              <Select
                value={view}
                onValueChange={(value) =>
                  setView(value as 'month' | 'week' | 'day' | 'list')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {viewOptions.map(({ value, icon: Icon, long }) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {long}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop: Button group */}
            <div className="hidden sm:flex items-center gap-1 rounded-md border bg-background p-1">
              {viewOptions.map(({ value, icon: Icon, short }) => (
                <Button
                  key={value}
                  variant={view === value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setView(value)}
                  className="h-8 px-2.5 text-xs font-semibold"
                >
                  <Icon className="h-4 w-4" />
                  <span className="ml-1.5">{short}</span>
                </Button>
              ))}
            </div>

            {isTrimmedRange && (view === 'week' || view === 'day') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllHours((prev) => !prev)}
                className="h-9 gap-1.5 bg-transparent text-xs font-semibold"
              >
                <Clock className="h-3.5 w-3.5" />
                {showAllHours ? labels.showCoreHours : labels.showAllHours}
              </Button>
            )}

            <Button
              onClick={() => {
                setIsCreating(true);
                setSelectedEvent(null);
                setIsDialogOpen(true);
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {labels.newEvent}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={labels.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setSearchQuery('')}
                aria-label={labels.clearSearch}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="-mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide sm:pb-0">
              {/* Color Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 gap-2 whitespace-nowrap bg-transparent text-xs font-semibold"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {labels.colors}
                    {selectedColors.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-5 px-1.5">
                        {selectedColors.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>{labels.filterByColor}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {colors.map((color) => (
                    <DropdownMenuCheckboxItem
                      key={color.value}
                      checked={selectedColors.includes(color.value)}
                      onCheckedChange={(checked) => {
                        setSelectedColors((prev) =>
                          checked
                            ? [...prev, color.value]
                            : prev.filter((c) => c !== color.value),
                        );
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn('h-3 w-3 rounded', color.bg)} />
                        {color.name}
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tag Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 gap-2 whitespace-nowrap bg-transparent text-xs font-semibold"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {labels.tags}
                    {selectedTags.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-5 px-1.5">
                        {selectedTags.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>{labels.filterByTag}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(checked) => {
                        setSelectedTags((prev) =>
                          checked
                            ? [...prev, tag]
                            : prev.filter((t) => t !== tag),
                        );
                      }}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Category Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 gap-2 whitespace-nowrap bg-transparent text-xs font-semibold"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {labels.categories}
                    {selectedCategories.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-5 px-1.5">
                        {selectedCategories.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>
                    {labels.filterByCategory}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories.map((category) => (
                    <DropdownMenuCheckboxItem
                      key={category}
                      checked={selectedCategories.includes(category)}
                      onCheckedChange={(checked) => {
                        setSelectedCategories((prev) =>
                          checked
                            ? [...prev, category]
                            : prev.filter((c) => c !== category),
                        );
                      }}
                    >
                      {category}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="flex-shrink-0 gap-1.5 whitespace-nowrap text-xs font-semibold"
                >
                  <X className="h-3.5 w-3.5" />
                  {labels.clear}
                </Button>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className={sectionLabel}>{labels.activeFilters}</span>
              {selectedColors.map((colorValue) => {
                const color = getColorClasses(colorValue);
                return (
                  <Badge key={colorValue} variant="secondary" className="gap-1">
                    <div className={cn('h-2 w-2 rounded-full', color.bg)} />
                    {color.name}
                    <button
                      onClick={() =>
                        setSelectedColors((prev) =>
                          prev.filter((c) => c !== colorValue),
                        )
                      }
                      className="ml-1 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    onClick={() =>
                      setSelectedTags((prev) => prev.filter((t) => t !== tag))
                    }
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedCategories.map((category) => (
                <Badge key={category} variant="secondary" className="gap-1">
                  {category}
                  <button
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        prev.filter((c) => c !== category),
                      )
                    }
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar + selected day agenda */}
      <div
        className={cn(
          'grid gap-4',
          showAgenda && 'xl:grid-cols-[minmax(0,1fr)_17rem]',
        )}
      >
        <div className="min-w-0">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={filteredEvents}
              onEventClick={openEvent}
              onDaySelect={selectDay}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              getColorClasses={getColorClasses}
              locale={locale}
              labels={labels}
            />
          )}

          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={filteredEvents}
              hours={hours}
              onEventClick={openEvent}
              onDaySelect={selectDay}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              getColorClasses={getColorClasses}
              locale={locale}
              labels={labels}
            />
          )}

          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={filteredEvents}
              hours={hours}
              onEventClick={openEvent}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              getColorClasses={getColorClasses}
              locale={locale}
              labels={labels}
            />
          )}

          {view === 'list' && (
            <ListView
              events={filteredEvents}
              onEventClick={openEvent}
              getColorClasses={getColorClasses}
              locale={locale}
              labels={labels}
            />
          )}
        </div>

        {showAgenda && (
          <AgendaPanel
            selectedDate={selectedDate}
            events={selectedDayEvents}
            onEventClick={openEvent}
            getColorClasses={getColorClasses}
            locale={locale}
            labels={labels}
          />
        )}
      </div>

      {/* Event Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? labels.createTitle : labels.detailTitle}
            </DialogTitle>
            <DialogDescription>
              {isCreating ? labels.createDescription : labels.detailDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{labels.titleField}</Label>
              <Input
                id="title"
                value={
                  (isCreating ? newEvent.title : selectedEvent?.title) ?? ''
                }
                onChange={(e) =>
                  isCreating
                    ? setNewEvent((prev) => ({ ...prev, title: e.target.value }))
                    : setSelectedEvent((prev) =>
                        prev ? { ...prev, title: e.target.value } : null,
                      )
                }
                placeholder={labels.titlePlaceholder}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{labels.descriptionField}</Label>
              <Textarea
                id="description"
                value={
                  (isCreating
                    ? newEvent.description
                    : selectedEvent?.description) ?? ''
                }
                onChange={(e) =>
                  isCreating
                    ? setNewEvent((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    : setSelectedEvent((prev) =>
                        prev ? { ...prev, description: e.target.value } : null,
                      )
                }
                placeholder={labels.descriptionPlaceholder}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">{labels.startTimeField}</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={
                    isCreating
                      ? newEvent.startTime
                        ? toLocalInputValue(newEvent.startTime)
                        : ''
                      : selectedEvent
                        ? toLocalInputValue(selectedEvent.startTime)
                        : ''
                  }
                  onChange={(e) => {
                    const date = new Date(e.target.value);
                    if (Number.isNaN(date.getTime())) return;
                    if (isCreating) {
                      setNewEvent((prev) => ({ ...prev, startTime: date }));
                    } else {
                      setSelectedEvent((prev) =>
                        prev ? { ...prev, startTime: date } : null,
                      );
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">{labels.endTimeField}</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={
                    isCreating
                      ? newEvent.endTime
                        ? toLocalInputValue(newEvent.endTime)
                        : ''
                      : selectedEvent
                        ? toLocalInputValue(selectedEvent.endTime)
                        : ''
                  }
                  onChange={(e) => {
                    const date = new Date(e.target.value);
                    if (Number.isNaN(date.getTime())) return;
                    if (isCreating) {
                      setNewEvent((prev) => ({ ...prev, endTime: date }));
                    } else {
                      setSelectedEvent((prev) =>
                        prev ? { ...prev, endTime: date } : null,
                      );
                    }
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">{labels.categoryField}</Label>
                <Select
                  value={isCreating ? newEvent.category : selectedEvent?.category}
                  onValueChange={(value) =>
                    isCreating
                      ? setNewEvent((prev) => ({ ...prev, category: value }))
                      : setSelectedEvent((prev) =>
                          prev ? { ...prev, category: value } : null,
                        )
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={labels.selectCategory} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">{labels.colorField}</Label>
                <Select
                  value={isCreating ? newEvent.color : selectedEvent?.color}
                  onValueChange={(value) =>
                    isCreating
                      ? setNewEvent((prev) => ({ ...prev, color: value }))
                      : setSelectedEvent((prev) =>
                          prev ? { ...prev, color: value } : null,
                        )
                  }
                >
                  <SelectTrigger id="color">
                    <SelectValue placeholder={labels.selectColor} />
                  </SelectTrigger>
                  <SelectContent>
                    {colors.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn('h-4 w-4 rounded', color.bg)} />
                          {color.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{labels.tagsField}</Label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = isCreating
                    ? newEvent.tags?.includes(tag)
                    : selectedEvent?.tags?.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant={isSelected ? 'default' : 'outline'}
                      className="cursor-pointer transition-all hover:scale-105"
                      onClick={() => toggleTag(tag, isCreating)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            {!isCreating && (
              <Button
                variant="destructive"
                onClick={() =>
                  selectedEvent && handleDeleteEvent(selectedEvent.id)
                }
              >
                {labels.delete}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setIsCreating(false);
                setSelectedEvent(null);
              }}
            >
              {labels.cancel}
            </Button>
            <Button onClick={isCreating ? handleCreateEvent : handleUpdateEvent}>
              {isCreating ? labels.create : labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ColorResolver = (color: string) => { bg: string; text: string };

/**
 * 미리보기 카드를 document.body 로 빼서 띄운다.
 * 달력 Card 는 모서리를 다듬기 위해 overflow-hidden 이라, 안에서 absolute 로 띄우면
 * 마지막 주·오른쪽 열의 카드가 테두리에 잘린다. 포털 + fixed 로 화면 기준 배치한다.
 */
export interface PreviewRect {
  top: number;
  bottom: number;
  left: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** 미리보기 카드 위치. 높이를 몰라도 되도록, 위로 붙일 때는 top 대신 bottom 을 쓴다. */
export interface PreviewBox {
  left: number;
  top?: number;
  bottom?: number;
  placement: 'below' | 'above';
}

const PREVIEW_GAP = 8;
const PREVIEW_MARGIN = 12;
/** 아래로 펼치기 위해 필요한 최소 여유 높이 */
const PREVIEW_MIN_SPACE = 220;

/**
 * 마우스를 올린 칸의 좌표만으로 최종 위치를 바로 계산한다.
 * 카드 높이를 재지 않기 때문에 "그린 뒤 옮기기"가 없고, 등장 애니메이션이
 * 처음부터 제자리에서 재생된다.
 */
export function computePreviewBox(
  anchor: PreviewRect,
  width: number,
  viewport: Viewport,
): PreviewBox {
  const left = Math.min(
    Math.max(PREVIEW_MARGIN, anchor.left),
    Math.max(PREVIEW_MARGIN, viewport.width - width - PREVIEW_MARGIN),
  );

  const spaceBelow = viewport.height - anchor.bottom;
  const spaceAbove = anchor.top;
  // 아래가 좁고 위가 더 넓을 때만 뒤집는다.
  if (spaceBelow < PREVIEW_MIN_SPACE && spaceAbove > spaceBelow) {
    return {
      left,
      bottom: Math.max(PREVIEW_MARGIN, viewport.height - anchor.top + PREVIEW_GAP),
      placement: 'above',
    };
  }

  return { left, top: anchor.bottom + PREVIEW_GAP, placement: 'below' };
}

/**
 * 미리보기 카드를 document.body 로 빼서 띄운다.
 * 달력 Card 는 모서리를 다듬기 위해 overflow-hidden 이고 주 보기는 내부 스크롤이 있어서,
 * 안에서 absolute 로 띄우면 마지막 주·오른쪽 열의 카드가 잘린다.
 */
function EventPreviewPortal({
  box,
  width,
  children,
}: {
  box: PreviewBox;
  width: number;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: box.left,
        top: box.top,
        bottom: box.bottom,
        width,
      }}
      className={cn(
        'tw-root pointer-events-none z-[70] animate-in fade-in duration-100',
        box.placement === 'above' ? 'origin-bottom' : 'origin-top',
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** 마우스를 올린 요소의 화면 좌표에서 바로 위치를 뽑는다. */
function boxFromElement(element: HTMLElement, width: number): PreviewBox {
  const rect = element.getBoundingClientRect();
  return computePreviewBox(rect, width, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
}

// Selected day agenda panel
function AgendaPanel({
  selectedDate,
  events,
  onEventClick,
  getColorClasses,
  locale,
  labels,
}: {
  selectedDate: Date;
  events: Event[];
  onEventClick: (event: Event) => void;
  getColorClasses: ColorResolver;
  locale: string;
  labels: EventManagerLabels;
}) {
  return (
    <Card className="h-fit p-4 xl:sticky xl:top-4">
      <p className={sectionLabel}>{labels.selectedDayLabel}</p>
      <div className="mt-3 flex items-end gap-3 border-b pb-4">
        <strong className="text-4xl font-bold leading-none tracking-[-0.04em] tabular-nums">
          {selectedDate.getDate()}
        </strong>
        <span className="text-sm font-medium leading-snug text-muted-foreground">
          {selectedDate.toLocaleDateString(locale, { month: 'long' })}
          <br />
          {selectedDate.toLocaleDateString(locale, { weekday: 'long' })}
        </span>
      </div>

      {events.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            {labels.eventCount(events.length)}
          </p>
          <div className="mt-2 space-y-2">
            {events.map((event) => {
              const colorClasses = getColorClasses(event.color);
              return (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="flex w-full items-start gap-2.5 rounded-md border bg-card p-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  <span
                    className={cn(
                      'mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full',
                      colorClasses.bg,
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium tabular-nums text-muted-foreground">
                      {event.startTime.toLocaleTimeString(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {event.category ? ` · ${event.category}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold">
                      {event.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {labels.noEventsForDay}
        </p>
      )}
    </Card>
  );
}

// EventCard component with hover effect
function EventCard({
  event,
  onEventClick,
  onDragStart,
  onDragEnd,
  getColorClasses,
  variant = 'default',
  locale,
  labels,
}: {
  event: Event;
  onEventClick: (event: Event) => void;
  onDragStart: (event: Event) => void;
  onDragEnd: () => void;
  getColorClasses: ColorResolver;
  variant?: 'default' | 'compact' | 'detailed';
  locale: string;
  labels: EventManagerLabels;
}) {
  // 미리보기 위치는 mouseenter 시점에 확정한다. 첫 렌더부터 제자리에 그려진다.
  const [preview, setPreview] = useState<PreviewBox | null>(null);
  const isHovered = preview !== null;
  const colorClasses = getColorClasses(event.color);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDuration = () => {
    const diff = event.endTime.getTime() - event.startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}${labels.hourSuffix} ${minutes}${labels.minuteSuffix}`;
    }
    return `${minutes}${labels.minuteSuffix}`;
  };

  if (variant === 'compact') {
    return (
      <div
        draggable={!event.locked}
        onDragStart={() => onDragStart(event)}
        onDragEnd={onDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onEventClick(event);
        }}
        onMouseEnter={(e) => setPreview(boxFromElement(e.currentTarget, 272))}
        onMouseLeave={() => setPreview(null)}
        className="relative cursor-pointer"
      >
        <div
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight transition-all duration-300',
            colorClasses.bg,
            'text-white truncate animate-in fade-in slide-in-from-top-1',
            isHovered && 'scale-105 shadow-lg z-10',
          )}
        >
          {event.title}
        </div>

        {preview && (
          <EventPreviewPortal box={preview} width={272}>
            <Card className="border-2 p-3 shadow-xl">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold leading-tight">
                    {event.title}
                  </h4>
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full flex-shrink-0',
                      colorClasses.bg,
                    )}
                  />
                </div>
                {event.description && (
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {event.description}
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {formatTime(event.startTime)} - {formatTime(event.endTime)}
                  </span>
                  <span className="text-[10px]">({getDuration()})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {event.category && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {event.category}
                    </Badge>
                  )}
                  {event.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] h-5"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          </EventPreviewPortal>
        )}
      </div>
    );
  }

  if (variant === 'detailed') {
    return (
      <div
        draggable={!event.locked}
        onDragStart={() => onDragStart(event)}
        onDragEnd={onDragEnd}
        onClick={() => onEventClick(event)}
        onMouseEnter={(e) => setPreview(boxFromElement(e.currentTarget, 288))}
        onMouseLeave={() => setPreview(null)}
        className={cn(
          'cursor-pointer rounded-lg px-3 py-2 transition-all duration-300',
          colorClasses.bg,
          'text-white animate-in fade-in slide-in-from-left-2',
          isHovered && 'scale-[1.01] shadow-xl ring-2 ring-white/50',
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold">{event.title}</span>
          <span className="flex-shrink-0 text-[11px] tabular-nums opacity-90">
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </span>
        </div>
        {event.description && (
          <div className="mt-0.5 text-xs leading-relaxed opacity-90 line-clamp-1">
            {event.description}
          </div>
        )}
        {isHovered && (
          <div className="mt-2 flex flex-wrap gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
            {event.category && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {event.category}
              </Badge>
            )}
            {event.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] h-5">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      draggable={!event.locked}
      onDragStart={() => onDragStart(event)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick(event);
      }}
      onMouseEnter={(e) => setPreview(boxFromElement(e.currentTarget, 288))}
      onMouseLeave={() => setPreview(null)}
      className="relative"
    >
      <div
        className={cn(
          'cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight transition-all duration-300',
          colorClasses.bg,
          'text-white animate-in fade-in slide-in-from-left-1',
          isHovered && 'scale-105 shadow-lg z-10',
        )}
      >
        <div className="truncate">{event.title}</div>
      </div>

      {preview && (
        <EventPreviewPortal box={preview} width={288}>
          <Card className="border-2 p-4 shadow-xl">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold leading-tight">{event.title}</h4>
                <div
                  className={cn(
                    'h-4 w-4 rounded-full flex-shrink-0',
                    colorClasses.bg,
                  )}
                />
              </div>
              {event.description && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {event.description}
                </p>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {formatTime(event.startTime)} - {formatTime(event.endTime)}
                  </span>
                  <span className="text-[10px]">({getDuration()})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {event.category && (
                    <Badge variant="secondary" className="text-xs">
                      {event.category}
                    </Badge>
                  )}
                  {event.tags?.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </EventPreviewPortal>
      )}
    </div>
  );
}

// Month View Component
function MonthView({
  currentDate,
  selectedDate,
  events,
  onEventClick,
  onDaySelect,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
  locale,
  labels,
}: {
  currentDate: Date;
  selectedDate: Date;
  events: Event[];
  onEventClick: (event: Event) => void;
  onDaySelect: (date: Date) => void;
  onDragStart: (event: Event) => void;
  onDragEnd: () => void;
  onDrop: (date: Date) => void;
  getColorClasses: ColorResolver;
  locale: string;
  labels: EventManagerLabels;
}) {
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  );

  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const days: Date[] = [];
  const cursor = new Date(startDate);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const getEventsForDay = (date: Date) =>
    events.filter((event) => isSameDay(event.startTime, date));

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {labels.weekdays.map((day, index) => (
          <div
            key={day}
            className={cn(
              'border-r p-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] last:border-r-0',
              index === 0 && 'text-destructive',
            )}
          >
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);

          return (
            <div
              key={index}
              role="gridcell"
              aria-selected={isSelected}
              onClick={() => onDaySelect(day)}
              className={cn(
                'min-h-20 cursor-pointer border-b border-r p-1 transition-colors last:border-r-0 sm:min-h-24 sm:p-1.5',
                !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                'hover:bg-accent/50',
                isSelected && 'bg-accent/60 ring-1 ring-inset ring-primary/40',
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(day)}
            >
              <div
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  isToday && 'bg-primary text-primary-foreground',
                  !isToday && isSelected && 'bg-primary/10 text-foreground',
                )}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEventClick={onEventClick}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    getColorClasses={getColorClasses}
                    variant="compact"
                    locale={locale}
                    labels={labels}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div className="pl-1 text-[10px] font-medium text-muted-foreground">
                    {labels.more(dayEvents.length - 3)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Week View Component
function WeekView({
  currentDate,
  selectedDate,
  events,
  hours,
  onEventClick,
  onDaySelect,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
  locale,
  labels,
}: {
  currentDate: Date;
  selectedDate: Date;
  events: Event[];
  hours: number[];
  onEventClick: (event: Event) => void;
  onDaySelect: (date: Date) => void;
  onDragStart: (event: Event) => void;
  onDragEnd: () => void;
  onDrop: (date: Date, hour: number) => void;
  getColorClasses: ColorResolver;
  locale: string;
  labels: EventManagerLabels;
}) {
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    return day;
  });

  const getEventsForDayAndHour = (date: Date, hour: number) =>
    events.filter(
      (event) =>
        isSameDay(event.startTime, date) && event.startTime.getHours() === hour,
    );

  const outsideRange = events.filter(
    (event) =>
      weekDays.some((day) => isSameDay(event.startTime, day)) &&
      !hours.includes(event.startTime.getHours()),
  );

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[32rem] overflow-auto">
        <div className="grid min-w-[38rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          <div className="sticky top-0 z-20 border-b border-r bg-muted/50 p-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {labels.timeColumn}
          </div>
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => onDaySelect(day)}
                className={cn(
                  'sticky top-0 z-20 border-b border-r bg-muted/50 p-2 text-center last:border-r-0 transition-colors hover:bg-accent/60',
                  isSelected && 'bg-accent',
                )}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {day.toLocaleDateString(locale, { weekday: 'short' })}
                </div>
                <div
                  className={cn(
                    'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    isToday && 'bg-primary text-primary-foreground',
                  )}
                >
                  {day.getDate()}
                </div>
              </button>
            );
          })}

          {hours.map((hour) => (
            <React.Fragment key={hour}>
              <div className="border-b border-r bg-card p-1 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                {hour.toString().padStart(2, '0')}
              </div>
              {weekDays.map((day) => {
                const dayEvents = getEventsForDayAndHour(day, hour);
                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="min-h-9 border-b border-r p-0.5 transition-colors last:border-r-0 hover:bg-accent/40"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(day, hour)}
                    onClick={() => onDaySelect(day)}
                  >
                    <div className="space-y-0.5">
                      {dayEvents.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onEventClick={onEventClick}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          getColorClasses={getColorClasses}
                          variant="default"
                          locale={locale}
                          labels={labels}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {outsideRange.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {labels.outsideRange}
          </span>
          {outsideRange.map((event) => (
            <button
              type="button"
              key={event.id}
              onClick={() => onEventClick(event)}
              className="flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-accent/60"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  getColorClasses(event.color).bg,
                )}
              />
              <span className="tabular-nums text-muted-foreground">
                {event.startTime.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {event.title}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// Day View Component
function DayView({
  currentDate,
  events,
  hours,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDrop,
  getColorClasses,
  locale,
  labels,
}: {
  currentDate: Date;
  events: Event[];
  hours: number[];
  onEventClick: (event: Event) => void;
  onDragStart: (event: Event) => void;
  onDragEnd: () => void;
  onDrop: (date: Date, hour: number) => void;
  getColorClasses: ColorResolver;
  locale: string;
  labels: EventManagerLabels;
}) {
  const getEventsForHour = (hour: number) =>
    events.filter(
      (event) =>
        isSameDay(event.startTime, currentDate) &&
        event.startTime.getHours() === hour,
    );

  const outsideRange = events.filter(
    (event) =>
      isSameDay(event.startTime, currentDate) &&
      !hours.includes(event.startTime.getHours()),
  );

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[32rem] overflow-auto">
        {hours.map((hour) => {
          const hourEvents = getEventsForHour(hour);
          const isCurrentHour =
            isSameDay(currentDate, new Date()) &&
            new Date().getHours() === hour;
          return (
            <div
              key={hour}
              className={cn(
                'flex border-b last:border-b-0',
                isCurrentHour && 'bg-primary/5',
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(currentDate, hour)}
            >
              <div className="w-14 flex-shrink-0 border-r p-2 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="min-h-11 flex-1 p-1 transition-colors hover:bg-accent/40">
                <div className="space-y-1">
                  {hourEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEventClick={onEventClick}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      getColorClasses={getColorClasses}
                      variant="detailed"
                      locale={locale}
                      labels={labels}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {outsideRange.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {labels.outsideRange}
          </span>
          {outsideRange.map((event) => (
            <button
              type="button"
              key={event.id}
              onClick={() => onEventClick(event)}
              className="flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium hover:bg-accent/60"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  getColorClasses(event.color).bg,
                )}
              />
              <span className="tabular-nums text-muted-foreground">
                {event.startTime.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {event.title}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// List View Component
function ListView({
  events,
  onEventClick,
  getColorClasses,
  locale,
  labels,
}: {
  events: Event[];
  onEventClick: (event: Event) => void;
  getColorClasses: ColorResolver;
  locale: string;
  labels: EventManagerLabels;
}) {
  const sortedEvents = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const groupedEvents = sortedEvents.reduce(
    (acc, event) => {
      const dateKey = event.startTime.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    },
    {} as Record<string, Event[]>,
  );

  return (
    <Card className="p-3 sm:p-4">
      <div className="space-y-6">
        {Object.entries(groupedEvents).map(([date, dateEvents]) => (
          <div key={date} className="space-y-3">
            <h3 className="text-xs font-semibold tracking-[0.02em] text-muted-foreground sm:text-sm">
              {date}
            </h3>
            <div className="space-y-2">
              {dateEvents.map((event) => {
                const colorClasses = getColorClasses(event.color);
                return (
                  <div
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className="group cursor-pointer rounded-lg border bg-card p-3 transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-2 duration-300 sm:p-4"
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div
                        className={cn(
                          'mt-1 h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3',
                          colorClasses.bg,
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold transition-colors group-hover:text-primary sm:text-base">
                              {event.title}
                            </h4>
                            {event.description && (
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2 sm:text-sm">
                                {event.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {event.category && (
                              <Badge variant="secondary" className="text-xs">
                                {event.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:gap-4 sm:text-xs">
                          <div className="flex items-center gap-1 tabular-nums">
                            <Clock className="h-3 w-3" />
                            {event.startTime.toLocaleTimeString(locale, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            -{' '}
                            {event.endTime.toLocaleTimeString(locale, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {event.tags && event.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {event.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] h-4 sm:text-xs sm:h-5"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {sortedEvents.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground sm:text-base">
            {labels.noEvents}
          </div>
        )}
      </div>
    </Card>
  );
}
