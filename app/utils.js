import { isToday, format, isYesterday, differenceInCalendarDays } from "date-fns";

export function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();

    if (isToday(date)) {
        // e.g., "5:52 PM"
        return format(date, 'p');
    }
    if (isYesterday(date)) {
        return 'Yesterday';
    }
    if (differenceInCalendarDays(now, date) < 7) {
        // e.g., "Monday", "Tuesday"
        return format(date, 'EEEE');
    }

    // e.g., "07/15/2026" - You can change this to 'dd/MM/yyyy' if you prefer day-first
    return format(date, 'MM/dd/yyyy');
}