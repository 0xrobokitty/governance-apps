import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DaoParticipationBadge } from "@/app/dao/components/DaoParticipationBadge";

afterEach(cleanup);

describe("DAO participation presentation", () => {
  it("hides wallet status when disconnected and qualifies displayed votes", () => {
    const view = render(<DaoParticipationBadge />);
    expect(screen.queryByTestId("dao-participation-badge")).toBeNull();
    view.rerender(<DaoParticipationBadge status="voted" />);
    expect(screen.getByTestId("dao-participation-badge")).toHaveAccessibleName(/Voted.*snapshot/);
    view.rerender(<DaoParticipationBadge status="pending" />);
    expect(screen.getByText("Vote pending")).toBeInTheDocument();
  });

});
